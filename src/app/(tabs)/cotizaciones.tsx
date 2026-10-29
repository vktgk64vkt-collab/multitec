import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { aprobarCotizacion, type FiltroProyectos, type Proyecto } from '@/db/proyectos';
import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { diasDesde, moneda } from '@/dinero';
import { normalizar } from '@/pedido';
import { FilaProyecto } from '@/proyectoUi';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';
import { Buscador, Chip, PROPS_TECLADO } from '@/ui';

const FILTROS: { id: FiltroProyectos; texto: string }[] = [
  { id: 'activos', texto: 'Por responder' },
  { id: 'cerrados', texto: 'Rechazadas' },
];

function detalleCotizacion(p: Proyecto, r: ProyectoConResumen['resumen']) {
  if (r.lineas === 0) return 'Aún sin líneas';
  const base = `${r.lineas} ${r.lineas === 1 ? 'línea' : 'líneas'} · ${moneda(r.total_cts)}`;
  const dias = p.cot_estado === 'enviada' ? diasDesde(p.enviada_en) : null;
  return dias === null ? base : `${base} · enviada ${dias === 0 ? 'hoy' : `hace ${dias} ${dias === 1 ? 'día' : 'días'}`}`;
}

/** Cotizaciones que esperan respuesta del cliente. Al aprobarse pasan a Proyectos. */
export default function Cotizaciones() {
  const db = useSQLiteContext();
  const [filtro, setFiltro] = useState<FiltroProyectos>('activos');
  const [filas, setFilas] = useState<ProyectoConResumen[]>([]);
  const [cargado, setCargado] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useFocusEffect(
    useCallback(() => {
      proyectosConResumen(db, filtro, 'cotizacion').then((r) => {
        setFilas(r);
        setCargado(true);
      });
    }, [db, filtro])
  );

  /** Aprobada: pasa a proyecto, arranca la ejecución y te lleva a él. */
  async function aprobar(id: number) {
    if (await aprobarCotizacion(db, id)) router.push({ pathname: '/proyecto/[id]', params: { id } });
  }

  const q = normalizar(busqueda);
  const visibles = q ? filas.filter((f) => normalizar(`${f.proyecto.nombre} ${f.proyecto.cliente} ${f.proyecto.tipo}`).includes(q)) : filas;

  return (
    <PantallaTab titulo="Cotización" subtitulo="Aprobadas, pasan a Proyectos">
      <FlatList {...PROPS_TECLADO}
        data={visibles}
        keyExtractor={(f) => String(f.proyecto.id)}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Buscador placeholder="Buscar por proyecto, cliente o tipo" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />
            <View style={estilos.filtros}>
              {FILTROS.map((f) => (
                <Chip key={f.id} texto={f.texto} activo={filtro === f.id} onPress={() => setFiltro(f.id)} />
              ))}
              <View style={{ flex: 1 }} />
              <Link href="/proyecto/nuevo" asChild>
                <Pressable accessibilityRole="button" style={estilos.nuevo}>
                  <Text style={estilos.textoNuevo}>+ Nueva</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        }
        ListEmptyComponent={
          cargado ? (
            <Text style={estilos.vacio}>
              {busqueda ? 'Sin resultados.' : filtro === 'cerrados' ? 'No hay cotizaciones rechazadas.' : 'No hay cotizaciones por responder. Empieza un levantamiento.'}
            </Text>
          ) : undefined
        }
        renderItem={({ item: { proyecto, resumen } }) => (
          <FilaProyecto
            proyecto={proyecto}
            detalle={detalleCotizacion(proyecto, resumen)}
            accion={resumen.lineas > 0 && proyecto.cot_estado !== 'rechazada' ? { texto: 'Aprobada', icono: 'checkmark', onPress: () => aprobar(proyecto.id) } : undefined}
            href={{ pathname: '/proyecto/[id]', params: { id: proyecto.id } }}
          />
        )}
      />
    </PantallaTab>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  filtros: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nuevo: { minHeight: 44, justifyContent: 'center' },
  textoNuevo: { color: color.primario, fontSize: 16, fontWeight: '600' },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
});

import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { FilaProyecto } from '@/proyectoUi';
import { normalizar } from '@/pedido';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';
import { Campo, PROPS_TECLADO } from '@/ui';

/** Levantamiento: elige el proyecto donde estás para agregar equipos o dictar un pedido. */
export default function Levantamientos() {
  const db = useSQLiteContext();
  const [filas, setFilas] = useState<ProyectoConResumen[]>([]);
  const [cargado, setCargado] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useFocusEffect(
    useCallback(() => {
      // un proyecto ya facturado no se levanta más: para eso están Proyectos o Facturas
      proyectosConResumen(db, 'activos').then((r) => {
        setFilas(r.filter((x) => !x.resumen.factura));
        setCargado(true);
      });
    }, [db])
  );

  const q = normalizar(busqueda);
  const visibles = q ? filas.filter((f) => normalizar(`${f.proyecto.nombre} ${f.proyecto.cliente} ${f.proyecto.tipo}`).includes(q)) : filas;

  return (
    <PantallaTab titulo="Levantamiento" subtitulo="¿En qué proyecto estás ahora?">
      <FlatList {...PROPS_TECLADO}
        data={visibles}
        keyExtractor={(f) => String(f.proyecto.id)}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<Campo placeholder="Buscar por proyecto, cliente o tipo" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />}
        ListEmptyComponent={
          !cargado ? undefined : busqueda ? (
            <Text style={estilos.vacio}>Sin resultados.</Text>
          ) : (
          <>
            <Text style={estilos.vacio}>No hay proyectos para levantar. Crea uno y empieza a agregar equipos.</Text>
            <Link href="/proyecto/nuevo" asChild>
              <Pressable accessibilityRole="button" style={estilos.nuevo}>
                <Text style={estilos.textoNuevo}>+ Nuevo proyecto</Text>
              </Pressable>
            </Link>
          </>
          )
        }
        renderItem={({ item: { proyecto, resumen } }) => (
          <FilaProyecto
            proyecto={proyecto}
            detalle={resumen.partidas > 0 ? `${resumen.partidas} ${resumen.partidas === 1 ? 'partida' : 'partidas'}` : 'Sin partidas todavía'}
            href={{ pathname: '/levantamiento', params: { proyecto: proyecto.id } }}
          />
        )}
      />
    </PantallaTab>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
  nuevo: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  textoNuevo: { color: color.primario, fontSize: 16, fontWeight: '600' },
});

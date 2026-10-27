import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';

import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { moneda } from '@/dinero';
import { FilaProyecto } from '@/proyectoUi';
import { normalizar } from '@/pedido';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';
import { Campo, PROPS_TECLADO } from '@/ui';

/** Cotización: elige el proyecto cuya cotización quieres armar, revisar o enviar. */
export default function Cotizaciones() {
  const db = useSQLiteContext();
  const [filas, setFilas] = useState<ProyectoConResumen[]>([]);
  const [cargado, setCargado] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useFocusEffect(
    useCallback(() => {
      proyectosConResumen(db, 'activos').then((r) => {
        setFilas(r.filter((x) => !x.resumen.factura));
        setCargado(true);
      });
    }, [db])
  );

  const q = normalizar(busqueda);
  const visibles = q ? filas.filter((f) => normalizar(`${f.proyecto.nombre} ${f.proyecto.cliente} ${f.proyecto.tipo}`).includes(q)) : filas;

  return (
    <PantallaTab titulo="Cotización" subtitulo="Elige el proyecto a cotizar">
      <FlatList {...PROPS_TECLADO}
        data={visibles}
        keyExtractor={(f) => String(f.proyecto.id)}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<Campo placeholder="Buscar por proyecto, cliente o tipo" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />}
        ListEmptyComponent={cargado ? <Text style={estilos.vacio}>{busqueda ? 'Sin resultados.' : 'No hay proyectos por cotizar. Crea un proyecto desde Inicio.'}</Text> : undefined}
        renderItem={({ item: { proyecto, resumen } }) => (
          <FilaProyecto
            proyecto={proyecto}
            detalle={resumen.lineas > 0 ? `${resumen.lineas} ${resumen.lineas === 1 ? 'línea' : 'líneas'} · ${moneda(resumen.total_cts)}` : 'Aún sin líneas'}
            href={{ pathname: '/cotizacion', params: { proyecto: proyecto.id } }}
          />
        )}
      />
    </PantallaTab>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
});

import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';

import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { moneda } from '@/dinero';
import { FilaProyecto } from '@/proyectoUi';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';

/** Cotización: elige el proyecto cuya cotización quieres armar, revisar o enviar. */
export default function Cotizaciones() {
  const db = useSQLiteContext();
  const [filas, setFilas] = useState<ProyectoConResumen[]>([]);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      proyectosConResumen(db, 'activos').then((r) => {
        setFilas(r.filter((x) => !x.resumen.factura));
        setCargado(true);
      });
    }, [db])
  );

  return (
    <PantallaTab titulo="Cotización" subtitulo="Elige el proyecto a cotizar">
      <FlatList
        data={filas}
        keyExtractor={(f) => String(f.proyecto.id)}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={cargado ? <Text style={estilos.vacio}>No hay proyectos por cotizar. Crea un proyecto desde Inicio.</Text> : undefined}
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

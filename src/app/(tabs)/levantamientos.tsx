import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { FilaProyecto } from '@/proyectoUi';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';

/** Levantamiento: elige el proyecto donde estás para agregar equipos o dictar un pedido. */
export default function Levantamientos() {
  const db = useSQLiteContext();
  const [filas, setFilas] = useState<ProyectoConResumen[]>([]);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // un proyecto ya facturado no se levanta más: para eso están Proyectos o Facturas
      proyectosConResumen(db, 'activos').then((r) => {
        setFilas(r.filter((x) => !x.resumen.factura));
        setCargado(true);
      });
    }, [db])
  );

  return (
    <PantallaTab titulo="Levantamiento" subtitulo="¿En qué proyecto estás ahora?">
      <FlatList
        data={filas}
        keyExtractor={(f) => String(f.proyecto.id)}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          !cargado ? undefined : (
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

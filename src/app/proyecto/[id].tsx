import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { cambiarEstado, ESTADOS, obtenerProyecto, type Proyecto } from '@/db/proyectos';

export default function DetalleProyecto() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerProyecto(db, Number(id)).then(setProyecto);
    }, [db, id])
  );

  if (!proyecto) return null;

  async function elegirEstado(estado: string) {
    await cambiarEstado(db, Number(id), estado);
    setProyecto((p) => p && { ...p, estado });
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{proyecto.nombre}</Text>
      <Text style={estilos.detalle}>
        {proyecto.cliente} · {proyecto.tipo}
      </Text>
      <Link href={{ pathname: '/levantamiento', params: { proyecto: proyecto.id } }} asChild>
        <Pressable style={estilos.boton}>
          <Text style={estilos.textoBoton}>Levantamiento</Text>
        </Pressable>
      </Link>
      <Link href={{ pathname: '/cotizacion', params: { proyecto: proyecto.id } }} asChild>
        <Pressable style={estilos.boton}>
          <Text style={estilos.textoBoton}>Cotización</Text>
        </Pressable>
      </Link>
      <Link href={{ pathname: '/factura', params: { proyecto: proyecto.id } }} asChild>
        <Pressable style={estilos.boton}>
          <Text style={estilos.textoBoton}>Factura</Text>
        </Pressable>
      </Link>
      <Link href={{ pathname: '/bitacora', params: { proyecto: proyecto.id } }} asChild>
        <Pressable style={estilos.boton}>
          <Text style={estilos.textoBoton}>Bitácora</Text>
        </Pressable>
      </Link>
      <Text style={estilos.etiqueta}>Estado</Text>
      {ESTADOS.map((e) => (
        <Pressable
          key={e}
          style={[estilos.opcion, e === proyecto.estado && estilos.activa]}
          onPress={() => elegirEstado(e)}>
          <Text style={e === proyecto.estado && estilos.textoActivo}>{e}</Text>
        </Pressable>
      ))}
      <Text style={estilos.creado}>Creado: {proyecto.creado_en}</Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  nombre: { fontSize: 24, fontWeight: '700' },
  detalle: { fontSize: 16, opacity: 0.7 },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 8 },
  opcion: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#999' },
  activa: { backgroundColor: '#12292d' },
  textoActivo: { color: '#fff', fontWeight: '600' },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center', marginTop: 8 },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  creado: { fontSize: 12, opacity: 0.5, marginTop: 8 },
});

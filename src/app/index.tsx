import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listarProyectos, type Proyecto } from '@/db/proyectos';

export default function Proyectos() {
  const db = useSQLiteContext();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarProyectos(db).then(setProyectos);
    }, [db])
  );

  return (
    <View style={estilos.contenedor}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Link href="/clientes" style={estilos.enlace}>
              Clientes
            </Link>
          ),
          headerRight: () => (
            <Link href="/proyecto/nuevo" style={estilos.enlace}>
              Nuevo
            </Link>
          ),
        }}
      />
      <FlatList
        data={proyectos}
        keyExtractor={(p) => String(p.id)}
        contentInsetAdjustmentBehavior="automatic"
        ListFooterComponent={
          <Link href="/respaldo" style={estilos.respaldo}>
            Respaldo de datos
          </Link>
        }
        ListEmptyComponent={
          <Text style={estilos.vacio}>Aún no hay proyectos. Toca &quot;Nuevo&quot; para crear el primero.</Text>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/proyecto/[id]', params: { id: item.id } }} asChild>
            <Pressable style={estilos.fila}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.detalle}>
                {item.cliente} · {item.tipo}
              </Text>
              <Text style={estilos.estado}>{item.estado}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  respaldo: { color: '#1e6fa8', fontSize: 15, textAlign: 'center', padding: 24 },
  enlace: { color: '#1e6fa8', fontSize: 17, fontWeight: '600' },
  fila: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999',
  },
  nombre: { fontSize: 17, fontWeight: '600' },
  detalle: { fontSize: 14, opacity: 0.7, marginTop: 2 },
  estado: { fontSize: 13, fontWeight: '600', color: '#1e6fa8', marginTop: 4 },
  vacio: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, opacity: 0.7 },
});

import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { listarClientes, type Cliente } from '@/db/clientes';

export default function ListaClientes() {
  const db = useSQLiteContext();
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db, busqueda).then(setClientes);
    }, [db, busqueda])
  );

  return (
    <View style={estilos.contenedor}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/clientes/formulario" style={estilos.nuevo}>
              Nuevo
            </Link>
          ),
        }}
      />
      <TextInput
        style={estilos.buscador}
        placeholder="Buscar por nombre, empresa o teléfono"
        value={busqueda}
        onChangeText={setBusqueda}
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      <FlatList
        data={clientes}
        keyExtractor={(c) => String(c.id)}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            {busqueda ? 'Sin resultados.' : 'Aún no hay clientes. Toca "Nuevo" para agregar el primero.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/clientes/[id]', params: { id: item.id } }} asChild>
            <Pressable style={estilos.fila}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              {item.empresa ? <Text style={estilos.detalle}>{item.empresa}</Text> : null}
              {item.telefono ? <Text style={estilos.detalle}>{item.telefono}</Text> : null}
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  nuevo: { color: '#1e6fa8', fontSize: 17, fontWeight: '600' },
  buscador: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  fila: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999',
  },
  nombre: { fontSize: 17, fontWeight: '600' },
  detalle: { fontSize: 14, opacity: 0.7, marginTop: 2 },
  vacio: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, opacity: 0.7 },
});

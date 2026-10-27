import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listarClientes, type Cliente } from '@/db/clientes';
import { color, tarjeta } from '@/tema';

export default function ListaClientes() {
  const db = useSQLiteContext();
  const { top } = useSafeAreaInsets();
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db, busqueda).then(setClientes);
    }, [db, busqueda])
  );

  return (
    <View style={[estilos.contenedor, { paddingTop: top + 12 }]}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>Clientes</Text>
        <Link href="/clientes/formulario" style={estilos.nuevo}>
          + Nuevo
        </Link>
      </View>
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
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            {busqueda ? 'Sin resultados.' : 'Aún no hay clientes. Toca "+ Nuevo" para agregar el primero.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/clientes/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[tarjeta, estilos.fila]}>
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
  contenedor: { flex: 1, backgroundColor: color.fondo },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  titulo: { fontSize: 32, fontWeight: '800', color: color.texto },
  nuevo: { color: color.primario, fontSize: 17, fontWeight: '600' },
  buscador: { margin: 16, padding: 12, borderRadius: 14, backgroundColor: color.tarjeta, fontSize: 16 },
  lista: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  fila: { gap: 2 },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  vacio: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, color: color.suave },
});

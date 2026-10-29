import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { Alert } from '@/alert';
import { FilaDeslizable } from '@/deslizar';
import { eliminarCliente, listarClientes, type Cliente } from '@/db/clientes';
import { color, tarjeta } from '@/tema';
import { Buscador, PROPS_TECLADO } from '@/ui';

/** Lista de clientes (se abre desde el menú de arriba a la derecha). */
export default function ListaClientes() {
  const db = useSQLiteContext();
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db, busqueda).then(setClientes);
    }, [db, busqueda])
  );

  function confirmarEliminar(c: Cliente) {
    Alert.alert('Eliminar cliente', `¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (await eliminarCliente(db, c.id)) listarClientes(db, busqueda).then(setClientes);
          else Alert.alert('Tiene proyectos', 'Este cliente tiene proyectos. Elimina o reasigna sus proyectos antes de borrarlo: así no se pierden cotizaciones ni facturas.');
        },
      },
    ]);
  }

  return (
    <FlatList {...PROPS_TECLADO}
      data={clientes}
      keyExtractor={(c) => String(c.id)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={estilos.lista}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <Stack.Screen
            options={{
              title: 'Clientes',
              headerRight: () => (
                <Link href="/clientes/formulario" asChild>
                  <Pressable accessibilityRole="button" hitSlop={12} style={estilos.nuevo}>
                    <Text style={estilos.textoNuevo}>+ Nuevo</Text>
                  </Pressable>
                </Link>
              ),
            }}
          />
          <Buscador placeholder="Buscar por nombre, empresa o teléfono" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />
        </>
      }
      ListEmptyComponent={<Text style={estilos.vacio}>{busqueda ? 'Sin resultados.' : 'Aún no hay clientes. Toca "+ Nuevo" para agregar el primero.'}</Text>}
      renderItem={({ item }) => (
        <FilaDeslizable onAccion={() => confirmarEliminar(item)}>
        <Link href={{ pathname: '/clientes/[id]', params: { id: item.id } }} asChild>
          <Pressable accessibilityRole="button" style={[tarjeta, estilos.fila]}>
            <Text style={estilos.nombre}>{item.nombre}</Text>
            {item.empresa ? <Text style={estilos.detalle}>{item.empresa}</Text> : null}
            {item.telefono ? <Text style={estilos.detalle}>{item.telefono}</Text> : null}
          </Pressable>
        </Link>
        </FilaDeslizable>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  lista: { padding: 16, paddingBottom: 24, gap: 10 },
  nuevo: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  textoNuevo: { color: color.primario, fontSize: 17, fontWeight: '600' },
  fila: { gap: 2 },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  vacio: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, color: color.suave },
});

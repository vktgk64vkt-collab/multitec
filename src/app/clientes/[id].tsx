import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { eliminarCliente, obtenerCliente, type Cliente } from '@/db/clientes';

export default function DetalleCliente() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cliente, setCliente] = useState<Cliente | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerCliente(db, Number(id)).then(setCliente);
    }, [db, id])
  );

  if (!cliente) return null;

  function confirmarEliminar() {
    Alert.alert('Eliminar cliente', `¿Eliminar a ${cliente?.nombre}? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarCliente(db, Number(id));
          router.back();
        },
      },
    ]);
  }

  const datos: { etiqueta: string; valor: string | null; enlace?: string }[] = [
    { etiqueta: 'Empresa', valor: cliente.empresa },
    { etiqueta: 'Teléfono', valor: cliente.telefono, enlace: cliente.telefono ? `tel:${cliente.telefono}` : undefined },
    { etiqueta: 'Correo', valor: cliente.correo, enlace: cliente.correo ? `mailto:${cliente.correo}` : undefined },
    {
      etiqueta: 'Dirección',
      valor: cliente.direccion,
      enlace: cliente.direccion
        ? `https://maps.apple.com/?q=${encodeURIComponent(cliente.direccion)}`
        : undefined,
    },
    { etiqueta: 'ID fiscal', valor: cliente.id_fiscal },
    { etiqueta: 'Notas', valor: cliente.notas },
  ];

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{cliente.nombre}</Text>
      {datos
        .filter((d) => d.valor)
        .map((d) => (
          <View key={d.etiqueta} style={estilos.grupo}>
            <Text style={estilos.etiqueta}>{d.etiqueta}</Text>
            <Text
              style={[estilos.valor, d.enlace && estilos.enlace]}
              onPress={d.enlace ? () => Linking.openURL(d.enlace as string) : undefined}
            >
              {d.valor}
            </Text>
          </View>
        ))}
      <Text style={estilos.creado}>Registrado: {cliente.creado_en}</Text>

      <Link href={{ pathname: '/clientes/formulario', params: { id: cliente.id } }} asChild>
        <Pressable style={estilos.boton}>
          <Text style={estilos.textoBoton}>Editar</Text>
        </Pressable>
      </Link>
      <Pressable style={[estilos.boton, estilos.peligro]} onPress={confirmarEliminar}>
        <Text style={estilos.textoBoton}>Eliminar</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 14 },
  nombre: { fontSize: 24, fontWeight: '700' },
  grupo: { gap: 2 },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.6 },
  valor: { fontSize: 16 },
  enlace: { color: '#1e6fa8' },
  creado: { fontSize: 12, opacity: 0.5 },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center' },
  peligro: { backgroundColor: '#c0262d' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

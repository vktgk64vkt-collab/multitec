import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { eliminarCliente, obtenerCliente, type Cliente } from '@/db/clientes';
import { listarProyectos, type Proyecto } from '@/db/proyectos';
import { color } from '@/tema';
import { Boton, Etiqueta, Tarjeta } from '@/ui';

export default function DetalleCliente() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);

  useFocusEffect(
    useCallback(() => {
      obtenerCliente(db, Number(id)).then(setCliente);
      listarProyectos(db).then((ps) => setProyectos(ps.filter((p) => p.cliente_id === Number(id))));
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
      enlace: cliente.direccion ? `https://maps.apple.com/?q=${encodeURIComponent(cliente.direccion)}` : undefined,
    },
    { etiqueta: 'ID fiscal', valor: cliente.id_fiscal },
    { etiqueta: 'Notas', valor: cliente.notas },
  ];

  const whatsapp = cliente.telefono?.replace(/\D/g, '');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{cliente.nombre}</Text>

      <View style={estilos.acciones}>
        {cliente.telefono ? <Boton texto="Llamar" onPress={() => Linking.openURL(`tel:${cliente.telefono}`)} /> : null}
        {whatsapp ? <Boton tipo="secundario" texto="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${whatsapp}`)} /> : null}
      </View>

      <Tarjeta>
        {datos
          .filter((d) => d.valor)
          .map((d) => (
            <View key={d.etiqueta} style={estilos.grupo}>
              <Text style={estilos.etiqueta}>{d.etiqueta}</Text>
              <Text
                style={[estilos.valor, d.enlace && estilos.enlace]}
                onPress={d.enlace ? () => Linking.openURL(d.enlace as string) : undefined}>
                {d.valor}
              </Text>
            </View>
          ))}
        <Text style={estilos.creado}>Registrado: {cliente.creado_en}</Text>
      </Tarjeta>

      <Etiqueta>Proyectos ({proyectos.length})</Etiqueta>
      {proyectos.length === 0 && <Text style={estilos.creado}>Este cliente aún no tiene proyectos.</Text>}
      {proyectos.map((p) => (
        <Link key={p.id} href={{ pathname: '/proyecto/[id]', params: { id: p.id } }} asChild>
          <Pressable>
            <Tarjeta style={estilos.proyecto}>
              <Text style={estilos.valor}>{p.nombre}</Text>
              <Text style={estilos.estado}>{p.estado}</Text>
            </Tarjeta>
          </Pressable>
        </Link>
      ))}

      <Link href={{ pathname: '/clientes/formulario', params: { id: cliente.id } }} asChild>
        <Pressable accessibilityRole="button" style={estilos.editar}>
          <Text style={estilos.textoEditar}>Editar</Text>
        </Pressable>
      </Link>
      <Boton tipo="peligro" texto="Eliminar cliente" onPress={confirmarEliminar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  nombre: { fontSize: 28, fontWeight: '800', color: color.texto },
  acciones: { gap: 8 },
  grupo: { gap: 2 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: color.suave },
  valor: { fontSize: 16, color: color.texto },
  enlace: { color: color.primario },
  creado: { fontSize: 12, color: color.suave },
  proyecto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estado: { fontSize: 12, fontWeight: '600', color: color.primario, textTransform: 'capitalize' },
  editar: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: color.primario, backgroundColor: color.tarjeta, alignItems: 'center' },
  textoEditar: { color: color.primario, fontSize: 16, fontWeight: '600' },
});

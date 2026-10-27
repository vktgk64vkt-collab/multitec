import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatear } from '@/dinero';
import { resumenFacturas } from '@/db/factura';
import { listarProyectos, type Proyecto } from '@/db/proyectos';
import { color, tarjeta } from '@/tema';

export default function Inicio() {
  const db = useSQLiteContext();
  const { top } = useSafeAreaInsets();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [resumen, setResumen] = useState({ por_cobrar: 0, cobrado: 0, vencido: 0 });

  useFocusEffect(
    useCallback(() => {
      listarProyectos(db).then(setProyectos);
      resumenFacturas(db).then((r) => r && setResumen(r));
    }, [db])
  );

  return (
    <FlatList
      style={{ backgroundColor: color.fondo }}
      contentContainerStyle={[estilos.lista, { paddingTop: top + 12 }]}
      data={proyectos}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>Multitec</Text>
          <View style={estilos.fila}>
            <View style={[tarjeta, estilos.resumen]}>
              <Text style={estilos.etiqueta}>Por cobrar</Text>
              <Text style={[estilos.monto, { color: color.alerta }]}>{formatear(resumen.por_cobrar)}</Text>
            </View>
            <View style={[tarjeta, estilos.resumen]}>
              <Text style={estilos.etiqueta}>Cobrado</Text>
              <Text style={[estilos.monto, { color: color.ok }]}>{formatear(resumen.cobrado)}</Text>
            </View>
          </View>
          {resumen.vencido > 0 ? (
            <View style={[tarjeta, estilos.resumen, { borderLeftWidth: 4, borderLeftColor: '#c0262d' }]}>
              <Text style={estilos.etiqueta}>Vencido</Text>
              <Text style={[estilos.monto, { color: '#c0262d' }]}>{formatear(resumen.vencido)}</Text>
            </View>
          ) : null}
          <View style={estilos.fila}>
            <Link href="/proyecto/nuevo" asChild>
              <Pressable style={estilos.accion}>
                <Text style={estilos.textoAccion}>+ Proyecto</Text>
              </Pressable>
            </Link>
            <Link href="/clientes/formulario" asChild>
              <Pressable style={[estilos.accion, estilos.secundaria]}>
                <Text style={[estilos.textoAccion, { color: color.primario }]}>+ Cliente</Text>
              </Pressable>
            </Link>
          </View>
          <Text style={estilos.seccion}>Proyectos</Text>
        </View>
      }
      ListEmptyComponent={<Text style={estilos.vacio}>Aún no hay proyectos. Toca &quot;+ Proyecto&quot; para crear el primero.</Text>}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/proyecto/[id]', params: { id: item.id } }} asChild>
          <Pressable style={[tarjeta, estilos.proyecto]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.detalle}>
                {item.cliente} · {item.tipo}
              </Text>
            </View>
            <Text style={estilos.estado}>{item.estado}</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  lista: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  cabecera: { gap: 12, marginBottom: 4 },
  titulo: { fontSize: 32, fontWeight: '800', color: color.texto },
  fila: { flexDirection: 'row', gap: 12 },
  resumen: { flex: 1, gap: 4 },
  etiqueta: { fontSize: 13, color: color.suave },
  monto: { fontSize: 22, fontWeight: '700' },
  accion: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' },
  secundaria: { backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.primario },
  textoAccion: { color: '#fff', fontSize: 16, fontWeight: '600' },
  seccion: { fontSize: 20, fontWeight: '700', color: color.texto, marginTop: 8 },
  proyecto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave, marginTop: 2 },
  estado: { fontSize: 12, fontWeight: '600', color: color.primario, textTransform: 'capitalize' },
  vacio: { textAlign: 'center', marginTop: 24, color: color.suave },
});

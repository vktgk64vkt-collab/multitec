import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, tarjeta } from '@/tema';

const OPCIONES = [
  { ruta: '/negocio', titulo: 'Perfil del negocio', detalle: 'Logo y datos para tus PDF' },
  { ruta: '/inventario', titulo: 'Inventario', detalle: 'Equipos y servicios, con precio y stock' },
  { ruta: '/reportes', titulo: 'Reportes', detalle: 'Facturado por mes y mejores clientes' },
  { ruta: '/respaldo', titulo: 'Respaldo de datos', detalle: 'Exportar o restaurar tu información' },
] as const;

export default function Mas() {
  const { top } = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: color.fondo }} contentContainerStyle={[estilos.contenedor, { paddingTop: top + 12 }]}>
      <Text style={estilos.titulo}>Más</Text>
      {OPCIONES.map((o) => (
        <Link key={o.ruta} href={o.ruta} asChild>
          <Pressable accessibilityRole="button" style={[tarjeta, estilos.fila]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{o.titulo}</Text>
              <Text style={estilos.detalle}>{o.detalle}</Text>
            </View>
            <Text style={estilos.flecha}>›</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  titulo: { fontSize: 32, fontWeight: '800', color: color.texto, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  flecha: { fontSize: 24, color: color.suave },
});

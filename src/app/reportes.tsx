import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { registrarAviso } from '@/avisos';
import { ventasCsv } from '@/ventasCsv';

import { reporte, ventasDelAnio, type Reporte } from '@/db/reportes';
import { formatearFecha, moneda } from '@/dinero';
import { color } from '@/tema';
import { Etiqueta, Tarjeta } from '@/ui';

export default function Reportes() {
  const db = useSQLiteContext();
  const [r, setR] = useState<Reporte | null>(null);

  useFocusEffect(
    useCallback(() => {
      reporte(db).then(setR);
    }, [db])
  );

  async function exportarVentas() {
    try {
      const anio = new Date().getFullYear();
      const filas = await ventasDelAnio(db, anio);
      if (filas.length === 0) return Alert.alert('Sin facturas', `No hay facturas en ${anio}.`);
      const f = new File(Paths.cache, `ventas-${anio}.csv`);
      f.create({ overwrite: true });
      f.write(ventasCsv(filas));
      if (!(await Sharing.isAvailableAsync())) return Alert.alert('No disponible', 'Compartir solo funciona en el iPhone.');
      await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (e) {
      Alert.alert('No se pudo exportar', `${String(e)}

Código: ${registrarAviso(e, 'reportes.ventas')}`);
    }
  }

  const maxMes = Math.max(1, ...(r?.porMes.map((m) => m.total_cts) ?? []));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Reportes' }} />
      <Etiqueta>Facturado por mes</Etiqueta>
      <Tarjeta>
        {r?.porMes.length === 0 && <Text style={estilos.vacio}>Aún no hay facturas.</Text>}
        {r?.porMes.map((m) => (
          <View key={m.mes} style={{ gap: 4 }}>
            <View style={estilos.fila}>
              <Text style={estilos.texto}>{formatearFecha(`${m.mes}-01`).replace(/^1 /, '')}</Text>
              <Text style={estilos.monto}>{moneda(m.total_cts)}</Text>
            </View>
            <View style={estilos.pista}>
              <View style={[estilos.barra, { width: `${(m.total_cts / maxMes) * 100}%` }]} />
            </View>
          </View>
        ))}
      </Tarjeta>

      <Etiqueta>Mejores clientes</Etiqueta>
      <Tarjeta>
        {r?.porCliente.length === 0 && <Text style={estilos.vacio}>Aún no hay facturas.</Text>}
        {r?.porCliente.map((c) => (
          <View key={c.cliente} style={estilos.fila}>
            <Text style={[estilos.texto, { flex: 1 }]}>{c.cliente}</Text>
            <Text style={estilos.monto}>{moneda(c.total_cts)}</Text>
          </View>
        ))}
      </Tarjeta>

      <Pressable accessibilityRole="button" style={estilos.boton} onPress={exportarVentas}>
        <Text style={estilos.textoBoton}>Enviar ventas del año al contador (CSV)</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  texto: { fontSize: 15, color: color.texto },
  monto: { fontSize: 15, fontWeight: '700', color: color.texto },
  pista: { height: 8, borderRadius: 4, backgroundColor: color.fondo },
  barra: { height: 8, borderRadius: 4, backgroundColor: color.primario },
  boton: { padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  vacio: { color: color.suave },
});

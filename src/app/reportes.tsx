import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { reporte, type Reporte } from '@/db/reportes';
import { formatear } from '@/dinero';
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
              <Text style={estilos.texto}>{m.mes}</Text>
              <Text style={estilos.monto}>{formatear(m.total_cts)}</Text>
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
            <Text style={estilos.monto}>{formatear(c.total_cts)}</Text>
          </View>
        ))}
      </Tarjeta>
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
  vacio: { color: color.suave },
});

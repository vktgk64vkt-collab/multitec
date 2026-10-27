import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Alert } from '@/alert';
import {
  crearFactura,
  listarLineasFactura,
  marcarPagada,
  NCF_VALIDO,
  obtenerFactura,
  type Factura as FacturaDB,
} from '@/db/factura';
import { formatear } from '@/dinero';
import { compartirPdf } from '@/pdf';

export default function Factura() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [factura, setFactura] = useState<FacturaDB | null>(null);
  const [ncf, setNcf] = useState('');

  const cargar = useCallback(() => obtenerFactura(db, proyectoId).then(setFactura), [db, proyectoId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function generar() {
    const codigo = ncf.trim().toUpperCase();
    if (!NCF_VALIDO.test(codigo)) {
      return Alert.alert('NCF inválido', 'Usa B01 + 8 dígitos (ej. B0100000001) o E31 + 10 dígitos.');
    }
    if (!(await crearFactura(db, proyectoId, codigo))) {
      return Alert.alert('Nada que facturar', 'Agrega líneas con precio en la cotización primero.');
    }
    cargar();
  }

  async function pdf(f: FacturaDB) {
    const ok = await compartirPdf({
      titulo: 'Factura',
      ncf: f.ncf,
      fecha: f.creado_en,
      cliente: f.cliente,
      rnc: f.id_fiscal,
      proyecto: f.proyecto,
      lineas: await listarLineasFactura(db, f.id),
      subtotal: f.subtotal_cts,
      impuesto: f.impuesto_cts,
      total: f.total_cts,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
  }

  async function alternarPago(f: FacturaDB) {
    await marcarPagada(db, f.id, !f.pagada);
    cargar();
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Factura' }} />

      {!factura ? (
        <>
          <Text style={estilos.detalle}>
            Genera la factura con los totales de la cotización actual. Después no cambian aunque edites la cotización.
          </Text>
          <TextInput
            style={estilos.campo}
            placeholder="NCF (ej. B0100000001)"
            autoCapitalize="characters"
            autoCorrect={false}
            value={ncf}
            onChangeText={setNcf}
          />
          <Pressable style={estilos.boton} onPress={generar}>
            <Text style={estilos.textoBoton}>Generar factura</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={estilos.ncf}>{factura.ncf}</Text>
          <Text style={estilos.detalle}>{factura.creado_en}</Text>
          <Text style={estilos.nombre}>{factura.cliente}</Text>
          <Text style={estilos.detalle}>RNC/Cédula: {factura.id_fiscal ?? 'sin registrar'}</Text>
          <View style={estilos.totales}>
            <Text style={estilos.detalle}>Subtotal: {formatear(factura.subtotal_cts)}</Text>
            <Text style={estilos.detalle}>ITBIS: {formatear(factura.impuesto_cts)}</Text>
            <Text style={estilos.total}>Total: {formatear(factura.total_cts)}</Text>
          </View>
          <Pressable style={estilos.boton} onPress={() => pdf(factura)}>
            <Text style={estilos.textoBoton}>Compartir PDF</Text>
          </Pressable>
          <Pressable style={[estilos.boton, factura.pagada ? estilos.pagada : null]} onPress={() => alternarPago(factura)}>
            <Text style={estilos.textoBoton}>{factura.pagada ? 'Pagada ✓ (toca para revertir)' : 'Marcar como pagada'}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  campo: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  ncf: { fontSize: 24, fontWeight: '700' },
  nombre: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  detalle: { fontSize: 14, opacity: 0.7 },
  totales: { marginVertical: 12, gap: 4 },
  total: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center' },
  pagada: { backgroundColor: '#1f7a3d' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarLineas, obtenerOpciones, type Linea } from '@/db/cotizacion';
import {
  crearFactura,
  eliminarPago,
  guardarVence,
  listarLineasFactura,
  listarPagos,
  NCF_VALIDO,
  obtenerFactura,
  registrarPago,
  type Factura as FacturaDB,
  type Pago,
} from '@/db/factura';
import { obtenerCondiciones } from '@/db/proyectos';
import { aCentavos, formatear, totales } from '@/dinero';
import { compartirPdf, negocioParaPdf } from '@/pdf';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

export default function Factura() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [factura, setFactura] = useState<FacturaDB | null>(null);
  const [cotizacion, setCotizacion] = useState<{ lineas: Linea[]; total: number }>({ lineas: [], total: 0 });
  const [ncf, setNcf] = useState('');
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [monto, setMonto] = useState('');
  const [vence, setVence] = useState('');

  const cargar = useCallback(
    () =>
      obtenerFactura(db, proyectoId).then(async (f) => {
        setFactura(f);
        setVence(f?.vence ?? '');
        setPagos(f ? await listarPagos(db, f.id) : []);
        if (!f) {
          const lineas = await listarLineas(db, proyectoId);
          const op = await obtenerOpciones(db, proyectoId);
          setCotizacion({ lineas, total: totales(lineas, op.impuesto_pct, op.con_itbis).total });
        }
      }),
    [db, proyectoId]
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  const pagado = pagos.reduce((s, p) => s + p.monto_cts, 0);
  const saldo = Math.max(0, (factura?.total_cts ?? 0) - pagado);
  const hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
  const vencida = !!factura?.vence && factura.vence < hoy && saldo > 0;
  const sinPrecio = cotizacion.lineas.filter((l) => l.precio_cts === 0).length;

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
      vence: f.vence,
      negocio: await negocioParaPdf(db),
      cliente: f.cliente,
      rnc: f.id_fiscal,
      proyecto: f.proyecto,
      lineas: await listarLineasFactura(db, f.id),
      subtotal: f.subtotal_cts,
      impuesto: f.impuesto_cts,
      total: f.total_cts,
      pagos: pagos.map((p) => ({ fecha: p.creado_en, monto_cts: p.monto_cts })),
      condiciones: await obtenerCondiciones(db, proyectoId),
      preciosConItbis: (await obtenerOpciones(db, proyectoId)).con_itbis,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
  }

  function whatsapp(f: FacturaDB) {
    const numero = f.telefono?.replace(/\D/g, '');
    if (!numero) return Alert.alert('Sin teléfono', 'Agrega el teléfono del cliente para escribirle por WhatsApp.');
    const mensaje =
      saldo > 0
        ? `Hola ${f.cliente}, le recordamos la factura ${f.ncf} por ${formatear(f.total_cts)}. Saldo pendiente: ${formatear(saldo)}${f.vence ? `, vence el ${f.vence}` : ''}. Gracias.`
        : `Hola ${f.cliente}, confirmamos el pago completo de la factura ${f.ncf}. Gracias por su confianza.`;
    Linking.openURL(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`);
  }

  async function cambiarVence(f: FacturaDB) {
    const v = vence.trim();
    if (v !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD, por ejemplo 2026-11-30.');
      return setVence(f.vence ?? '');
    }
    await guardarVence(db, f.id, v || null);
    cargar();
  }

  async function pagar(f: FacturaDB, cts: number | null) {
    if (cts === null || cts <= 0) return Alert.alert('Monto inválido', 'Escribe un monto mayor a 0.');
    await registrarPago(db, f.id, cts);
    setMonto('');
    cargar();
  }

  function quitarPago(f: FacturaDB, p: Pago) {
    Alert.alert('Eliminar pago', `¿Eliminar el pago de ${formatear(p.monto_cts)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarPago(db, f.id, p.id);
          cargar();
        },
      },
    ]);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Factura' }} />

      {!factura ? (
        <>
          <Tarjeta>
            <Etiqueta>Se facturará esta cotización</Etiqueta>
            <Text style={estilos.total}>{formatear(cotizacion.total)}</Text>
            <Text style={estilos.detalle}>
              {cotizacion.lineas.length} línea{cotizacion.lineas.length === 1 ? '' : 's'} · después no cambian aunque edites la cotización
            </Text>
            {sinPrecio > 0 ? (
              <Text style={estilos.aviso}>
                {sinPrecio} línea{sinPrecio === 1 ? '' : 's'} sin precio. Revísalas en la cotización antes de facturar.
              </Text>
            ) : null}
            <Text style={estilos.detalle}>Al facturar, el stock del inventario baja según las cantidades.</Text>
          </Tarjeta>
          <Tarjeta>
            <Etiqueta>Comprobante fiscal (NCF)</Etiqueta>
            <Campo placeholder="Ej. B0100000001" autoCapitalize="characters" autoCorrect={false} value={ncf} onChangeText={setNcf} />
            <Boton texto="Generar factura" onPress={generar} />
          </Tarjeta>
        </>
      ) : (
        <>
          <Tarjeta style={estilos.grupo}>
            <Text style={estilos.ncf}>{factura.ncf}</Text>
            <Text style={estilos.detalle}>{factura.creado_en}</Text>
            <Text style={estilos.nombre}>{factura.cliente}</Text>
            <Text style={estilos.detalle}>RNC/Cédula: {factura.id_fiscal ?? 'sin registrar'}</Text>
          </Tarjeta>
          <Tarjeta style={estilos.grupo}>
            <Text style={estilos.detalle}>Subtotal: {formatear(factura.subtotal_cts)}</Text>
            <Text style={estilos.detalle}>ITBIS: {formatear(factura.impuesto_cts)}</Text>
            <Text style={estilos.total}>Total: {formatear(factura.total_cts)}</Text>
            <Text style={[estilos.detalle, { color: color.ok }]}>Pagado: {formatear(pagado)}</Text>
            <Text style={[estilos.saldo, { color: saldo > 0 ? color.alerta : color.ok }]}>
              {saldo > 0 ? `Saldo: ${formatear(saldo)}` : 'Pagada ✓'}
            </Text>
            {vencida ? <Text style={estilos.vencida}>Vencida</Text> : null}
            <Etiqueta>Vence (AAAA-MM-DD)</Etiqueta>
            <Campo
              placeholder="Sin fecha de vencimiento"
              value={vence}
              onChangeText={setVence}
              onEndEditing={() => cambiarVence(factura)}
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />
          </Tarjeta>
          <Tarjeta style={estilos.grupo}>
            <Text style={estilos.seccion}>Pagos</Text>
            {pagos.length === 0 ? <Text style={estilos.detalle}>Aún no hay pagos registrados.</Text> : null}
            {pagos.map((p) => (
              <Pressable key={p.id} style={estilos.pago} onLongPress={() => quitarPago(factura, p)}>
                <Text style={estilos.detalle}>{p.creado_en}</Text>
                <Text style={estilos.nombre}>{formatear(p.monto_cts)}</Text>
              </Pressable>
            ))}
            {pagos.length > 0 ? <Text style={estilos.pista}>Mantén presionado un pago para eliminarlo.</Text> : null}
            {saldo > 0 ? (
              <View style={{ gap: 8 }}>
                <Campo
                  placeholder={`Monto (saldo ${formatear(saldo)})`}
                  keyboardType="decimal-pad"
                  value={monto}
                  onChangeText={setMonto}
                />
                <Boton texto="Registrar pago" onPress={() => pagar(factura, aCentavos(monto))} />
                <Boton tipo="secundario" texto="Pagar el saldo completo" onPress={() => pagar(factura, saldo)} />
              </View>
            ) : null}
          </Tarjeta>
          <Boton texto="Compartir PDF" onPress={() => pdf(factura)} />
          <Boton tipo="secundario" texto={saldo > 0 ? 'Recordar pago por WhatsApp' : 'Confirmar pago por WhatsApp'} onPress={() => whatsapp(factura)} />
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  grupo: { gap: 4 },
  ncf: { fontSize: 24, fontWeight: '700', color: color.texto },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  seccion: { fontSize: 18, fontWeight: '700', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  aviso: { fontSize: 14, color: color.alerta, fontWeight: '600' },
  pista: { fontSize: 12, color: color.suave },
  pago: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  total: { fontSize: 22, fontWeight: '700', color: color.texto },
  saldo: { fontSize: 18, fontWeight: '700' },
  vencida: {
    alignSelf: 'flex-start',
    color: '#fff',
    backgroundColor: '#c0262d',
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
});

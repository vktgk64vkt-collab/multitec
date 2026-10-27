import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarCatalogo } from '@/db/catalogo';
import { listarLineas, obtenerOpciones, type Linea } from '@/db/cotizacion';
import {
  anularFactura,
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
import { listarAreas } from '@/db/levantamiento';
import { obtenerCondiciones } from '@/db/proyectos';
import { agruparLineas, aCentavos, sinArea, fechaEn, formatear, formatearFecha, importe, moneda, totales } from '@/dinero';
import { urlWhatsApp } from '@/contacto';
import { obtenerNegocio } from '@/db/negocio';
import { compartirPdf, negocioParaPdf } from '@/pdf';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta } from '@/ui';

const PLAZOS = [15, 30, 60];

export default function Factura() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [factura, setFactura] = useState<FacturaDB | null>(null);
  const [cotizacion, setCotizacion] = useState<{ lineas: Linea[]; total: number; sinStock: string[] }>({ lineas: [], total: 0, sinStock: [] });
  const [ncf, setNcf] = useState('');
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [monto, setMonto] = useState('');
  const [vence, setVence] = useState('');
  const [detalle, setDetalle] = useState<Awaited<ReturnType<typeof listarLineasFactura>>>([]);
  const [areas, setAreas] = useState<string[]>([]);

  const cargar = useCallback(
    () =>
      obtenerFactura(db, proyectoId).then(async (f) => {
        setFactura(f);
        setVence(f?.vence ?? '');
        setPagos(f ? await listarPagos(db, f.id) : []);
        setDetalle(f ? await listarLineasFactura(db, f.id) : []);
        setAreas(await listarAreas(db, proyectoId));
        if (!f) {
          const lineas = await listarLineas(db, proyectoId);
          const op = await obtenerOpciones(db, proyectoId);
          // equipos que piden más de lo que hay en bodega (solo los que llevan conteo)
          const inventario = new Map((await listarCatalogo(db)).map((p) => [p.id, p]));
          const pedido = new Map<number, number>();
          for (const l of lineas) if (l.item_id !== null) pedido.set(l.item_id, (pedido.get(l.item_id) ?? 0) + l.cantidad);
          const sinStock = [...pedido]
            .map(([itemId, cant]) => ({ p: inventario.get(itemId), cant }))
            .filter(({ p, cant }) => p && p.stock !== null && cant > p.stock)
            .map(({ p, cant }) => `${p?.nombre}: pides ${cant}, hay ${p?.stock}`);
          setCotizacion({ lineas, total: totales(lineas, op.impuesto_pct, op.con_itbis).total, sinStock });
        }
      }),
    [db, proyectoId]
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  const pagado = pagos.reduce((s, p) => s + p.monto_cts, 0);
  const saldo = Math.max(0, (factura?.total_cts ?? 0) - pagado);
  const anulada = factura?.anulada === 1;
  const hoy = fechaEn(0);
  const vencida = !!factura?.vence && factura.vence < hoy && saldo > 0 && !anulada;
  const sinPrecio = cotizacion.lineas.filter((l) => l.precio_cts === 0).length;

  async function generar() {
    const codigo = ncf.trim().toUpperCase();
    if (!NCF_VALIDO.test(codigo)) {
      return Alert.alert('NCF inválido', 'Usa B01 + 8 dígitos (ej. B0100000001) o E31 + 10 dígitos.');
    }
    const r = await crearFactura(db, proyectoId, codigo);
    if (r === 'sin_monto') return Alert.alert('Nada que facturar', 'Agrega líneas con precio en la cotización primero.');
    if (r === 'ncf_repetido') return Alert.alert('NCF repetido', 'Ese NCF ya está en otra factura. Un NCF no se puede usar dos veces, ni el de una factura anulada.');
    cargar();
  }

  async function pdf(f: FacturaDB) {
    const ok = await compartirPdf({
      titulo: f.anulada ? 'Factura (ANULADA)' : 'Factura',
      ncf: f.ncf,
      fecha: formatearFecha(f.creado_en),
      vence: f.vence ? formatearFecha(f.vence) : null,
      negocio: await negocioParaPdf(db),
      areas: await listarAreas(db, proyectoId),
      cliente: f.cliente,
      rnc: f.id_fiscal,
      proyecto: f.proyecto,
      lineas: await listarLineasFactura(db, f.id),
      subtotal: f.subtotal_cts,
      impuesto: f.impuesto_cts,
      total: f.total_cts,
      pagos: pagos.map((p) => ({ fecha: formatearFecha(p.creado_en), monto_cts: p.monto_cts })),
      condiciones: await obtenerCondiciones(db, proyectoId),
      preciosConItbis: (await obtenerOpciones(db, proyectoId)).con_itbis,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
  }

  async function whatsapp(f: FacturaDB) {
    const empresa = (await obtenerNegocio(db))?.nombre?.trim();
    const firma = empresa ? `\n— ${empresa}` : '';
    const mensaje =
      saldo > 0
        ? `Hola ${f.cliente}, le recordamos la factura ${f.ncf} por ${moneda(f.total_cts)}. Saldo pendiente: ${moneda(saldo)}${f.vence ? `, vence el ${formatearFecha(f.vence)}` : ''}. Gracias.${firma}`
        : `Hola ${f.cliente}, confirmamos el pago completo de la factura ${f.ncf}. Gracias por su confianza.${firma}`;
    const url = urlWhatsApp(f.telefono, mensaje);
    if (!url) return Alert.alert('Sin teléfono', 'Agrega el teléfono del cliente para escribirle por WhatsApp.');
    await Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir WhatsApp', 'Revisa que esté instalado en este iPhone.'));
  }

  async function ponerVence(f: FacturaDB, valor: string) {
    const v = valor.trim();
    if (v !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD, por ejemplo 2026-11-30.');
      return setVence(f.vence ?? '');
    }
    await guardarVence(db, f.id, v || null);
    cargar();
  }

  async function pagar(f: FacturaDB, cts: number | null) {
    if (cts === null || cts <= 0) return Alert.alert('Monto inválido', 'Escribe un monto mayor a 0.');
    if (cts > saldo) return Alert.alert('Pago mayor al saldo', `El saldo es ${moneda(saldo)}. Escribe ese monto o uno menor.`);
    if (!(await registrarPago(db, f.id, cts))) return Alert.alert('No se registró', 'El pago supera el saldo o la factura está anulada.');
    setMonto('');
    cargar();
  }

  function quitarPago(f: FacturaDB, p: Pago) {
    Alert.alert('Eliminar pago', `¿Eliminar el pago de ${moneda(p.monto_cts)}?`, [
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

  function confirmarAnular(f: FacturaDB) {
    if (pagos.length > 0) {
      return Alert.alert('Tiene pagos', 'Elimina primero los pagos registrados (mantén presionado cada uno) y luego anula la factura.');
    }
    Alert.alert(
      'Anular factura',
      `¿Anular ${f.ncf}? El NCF queda consumido, el stock de los equipos vuelve al inventario y la factura sale de tus totales. Para volver a facturar, duplica el proyecto.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            await anularFactura(db, f.id);
            cargar();
          },
        },
      ]
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Factura' }} />

      {!factura ? (
        <>
          <Tarjeta>
            <Etiqueta>Se facturará esta cotización</Etiqueta>
            <Text style={estilos.total}>{moneda(cotizacion.total)}</Text>
            <Text style={estilos.detalle}>
              {cotizacion.lineas.length} línea{cotizacion.lineas.length === 1 ? '' : 's'} · después no cambian aunque edites la cotización
            </Text>
            {sinPrecio > 0 ? (
              <Text style={estilos.aviso}>
                {sinPrecio} línea{sinPrecio === 1 ? '' : 's'} sin precio. Revísalas en la cotización antes de facturar.
              </Text>
            ) : null}
            {cotizacion.sinStock.length > 0 ? (
              <Text style={estilos.aviso}>Stock insuficiente en bodega:{'\n'}{cotizacion.sinStock.join('\n')}</Text>
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
            {anulada ? <Text style={estilos.anulada}>ANULADA</Text> : null}
            <Text style={estilos.detalle}>{formatearFecha(factura.creado_en)}</Text>
            <Text style={estilos.nombre}>{factura.cliente}</Text>
            <Text style={estilos.detalle}>RNC/Cédula: {factura.id_fiscal ?? 'sin registrar'}</Text>
          </Tarjeta>
          <Tarjeta style={estilos.grupo}>
            <Text style={estilos.seccion}>Detalle</Text>
            {agruparLineas(detalle.map((l) => ({ ...l, descripcion: sinArea(l.descripcion, areas) }))).map((l, i) => (
              <View key={i} style={estilos.linea}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nombre}>
                    {l.cantidad} × {l.descripcion}
                  </Text>
                  {l.detalle ? <Text style={estilos.detalle}>{l.detalle}</Text> : null}
                </View>
                <Text style={estilos.nombre}>{formatear(importe(l))}</Text>
              </View>
            ))}
          </Tarjeta>
          <Tarjeta style={estilos.grupo}>
            <Text style={estilos.detalle}>Subtotal: {moneda(factura.subtotal_cts)}</Text>
            <Text style={estilos.detalle}>ITBIS: {moneda(factura.impuesto_cts)}</Text>
            <Text style={estilos.total}>Total: {moneda(factura.total_cts)}</Text>
            {!anulada ? (
              <>
                <Text style={[estilos.detalle, { color: color.ok }]}>Pagado: {moneda(pagado)}</Text>
                <Text style={[estilos.saldo, { color: saldo > 0 ? color.alerta : color.ok }]}>
                  {saldo > 0 ? `Saldo: ${moneda(saldo)}` : 'Pagada ✓'}
                </Text>
                {vencida ? <Text style={estilos.vencida}>Vencida</Text> : null}
                <Etiqueta>Vence</Etiqueta>
                <View style={estilos.chips}>
                  {PLAZOS.map((d) => (
                    <Chip key={d} texto={`En ${d} días`} activo={vence === fechaEn(d)} onPress={() => ponerVence(factura, fechaEn(d))} />
                  ))}
                </View>
                <Campo
                  placeholder="O escribe la fecha: AAAA-MM-DD"
                  value={vence}
                  onChangeText={setVence}
                  onEndEditing={() => ponerVence(factura, vence)}
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                />
                {factura.vence ? <Text style={estilos.pista}>Vence el {formatearFecha(factura.vence)}</Text> : null}
              </>
            ) : null}
          </Tarjeta>
          {!anulada ? (
            <Tarjeta style={estilos.grupo}>
              <Text style={estilos.seccion}>Pagos</Text>
              {pagos.length === 0 ? <Text style={estilos.detalle}>Aún no hay pagos registrados.</Text> : null}
              {pagos.map((p) => (
                <Pressable key={p.id} style={estilos.pago} onLongPress={() => quitarPago(factura, p)} accessibilityHint="Mantén presionado para eliminar">
                  <Text style={estilos.detalle}>{formatearFecha(p.creado_en, true)}</Text>
                  <Text style={estilos.nombre}>{moneda(p.monto_cts)}</Text>
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
          ) : null}
          <Boton texto="Compartir PDF" onPress={() => pdf(factura)} />
          {!anulada ? (
            <>
              <Boton tipo="secundario" texto={saldo > 0 ? 'Recordar pago por WhatsApp' : 'Confirmar pago por WhatsApp'} onPress={() => whatsapp(factura)} />
              <Boton tipo="peligro" texto="Anular factura" onPress={() => confirmarAnular(factura)} />
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  grupo: { gap: 4 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  ncf: { fontSize: 24, fontWeight: '700', color: color.texto },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  seccion: { fontSize: 18, fontWeight: '700', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  aviso: { fontSize: 14, color: color.alerta, fontWeight: '600' },
  pista: { fontSize: 12, color: color.suave },
  pago: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, minHeight: 44, alignItems: 'center' },
  linea: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
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
  anulada: {
    alignSelf: 'flex-start',
    color: '#fff',
    backgroundColor: color.suave,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
});

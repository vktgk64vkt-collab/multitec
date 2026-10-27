import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { FilaDeslizable } from '@/deslizar';
import { anularFactura, listarFacturas, resumenFacturas, type FilaFactura } from '@/db/factura';
import { proyectosConResumen, type ProyectoConResumen } from '@/db/resumen';
import { fechaEn, formatearFecha, moneda } from '@/dinero';
import { FilaProyecto } from '@/proyectoUi';
import { PantallaTab } from '@/pestanas';
import { color, tarjeta } from '@/tema';

const SIN_RESUMEN = { por_cobrar: 0, cobrado: 0, vencido: 0 };

/** Facturas: lo que te deben, lo que cobraste, lo que ya está listo para facturar y todas tus facturas. */
export default function Facturas() {
  const db = useSQLiteContext();
  const [resumen, setResumen] = useState(SIN_RESUMEN);
  const [facturas, setFacturas] = useState<FilaFactura[]>([]);
  const [cargado, setCargado] = useState(false);
  const [porFacturar, setPorFacturar] = useState<ProyectoConResumen[]>([]);

  const cargar = useCallback(() => {
    resumenFacturas(db).then(setResumen);
    listarFacturas(db).then((f) => {
      setFacturas(f);
      setCargado(true);
    });
    // proyectos en curso con cotización armada y sin factura
    proyectosConResumen(db, 'activos').then((r) => setPorFacturar(r.filter((x) => !x.resumen.factura && x.resumen.total_cts > 0)));
  }, [db]);
  useFocusEffect(cargar);

  function confirmarAnular(f: FilaFactura) {
    Alert.alert(
      'Anular factura',
      `¿Anular ${f.ncf}? El NCF queda consumido, el stock vuelve al inventario y la factura sale de tus totales. Para volver a facturar, duplica el proyecto.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            if (await anularFactura(db, f.id)) cargar();
            else Alert.alert('Tiene pagos', 'Abre la factura y elimina primero los pagos registrados; luego podrás anularla.');
          },
        },
      ]
    );
  }

  const hoy = fechaEn(0);

  return (
    <PantallaTab titulo="Facturas">
      <ScrollView contentContainerStyle={estilos.contenido}>
        <View style={estilos.fila}>
          <View style={[tarjeta, estilos.cifra]}>
            <Text style={estilos.etiqueta}>Por cobrar</Text>
            <Text style={[estilos.monto, { color: color.alerta }]}>{moneda(resumen.por_cobrar)}</Text>
          </View>
          <View style={[tarjeta, estilos.cifra]}>
            <Text style={estilos.etiqueta}>Cobrado</Text>
            <Text style={[estilos.monto, { color: color.ok }]}>{moneda(resumen.cobrado)}</Text>
          </View>
        </View>
        {resumen.vencido > 0 ? (
          <View style={[tarjeta, estilos.vencido]}>
            <Text style={estilos.etiqueta}>Vencido</Text>
            <Text style={[estilos.monto, { color: '#c0262d' }]}>{moneda(resumen.vencido)}</Text>
          </View>
        ) : null}

        {porFacturar.length > 0 ? (
          <>
            <Text style={estilos.seccion}>Listos para facturar</Text>
            {porFacturar.map(({ proyecto, resumen: r }) => (
              <FilaProyecto key={proyecto.id} proyecto={proyecto} detalle={`Cotización ${moneda(r.total_cts)}`} href={{ pathname: '/factura', params: { proyecto: proyecto.id } }} />
            ))}
          </>
        ) : null}

        <Text style={estilos.seccion}>Facturas</Text>
        {cargado && facturas.length === 0 ? <Text style={estilos.vacio}>Aún no hay facturas. Se crean desde un proyecto, después de cotizar.</Text> : null}
        {facturas.map((f) => {
          const saldo = Math.max(0, f.total_cts - f.pagado_cts);
          const vencida = !f.anulada && saldo > 0 && !!f.vence && f.vence < hoy;
          const estado = f.anulada ? 'Anulada' : saldo === 0 ? 'Pagada ✓' : vencida ? `Vencida · ${moneda(saldo)}` : `Saldo ${moneda(saldo)}`;
          return (
            <FilaDeslizable key={f.id} etiqueta="Anular" deshabilitada={!!f.anulada} onAccion={() => confirmarAnular(f)}>
            <Link href={{ pathname: '/factura', params: { proyecto: f.proyecto_id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={`Factura ${f.ncf}, ${f.cliente}, ${estado}`} style={[tarjeta, estilos.factura, f.anulada ? { opacity: 0.6 } : null]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={estilos.ncf}>{f.ncf}</Text>
                  <Text style={estilos.detalle}>
                    {f.cliente} · {f.proyecto}
                  </Text>
                  <Text style={estilos.detalle}>{formatearFecha(f.creado_en)}</Text>
                </View>
                <View style={estilos.derecha}>
                  <Text style={estilos.total}>{moneda(f.total_cts)}</Text>
                  <Text style={[estilos.estado, f.anulada ? { color: color.suave } : saldo === 0 ? { color: color.ok } : vencida ? { color: '#c0262d' } : { color: color.alerta }]}>{estado}</Text>
                </View>
              </Pressable>
            </Link>
            </FilaDeslizable>
          );
        })}
      </ScrollView>
    </PantallaTab>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  fila: { flexDirection: 'row', gap: 12 },
  cifra: { flex: 1, gap: 4 },
  vencido: { gap: 4, borderLeftWidth: 4, borderLeftColor: '#c0262d' },
  etiqueta: { fontSize: 13, color: color.suave },
  monto: { fontSize: 20, fontWeight: '700' },
  seccion: { fontSize: 20, fontWeight: '700', color: color.texto, marginTop: 8 },
  vacio: { textAlign: 'center', color: color.suave, marginVertical: 12 },
  factura: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ncf: { fontSize: 16, fontWeight: '700', color: color.texto },
  detalle: { fontSize: 13, color: color.suave },
  derecha: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 16, fontWeight: '700', color: color.texto },
  estado: { fontSize: 12, fontWeight: '700' },
});

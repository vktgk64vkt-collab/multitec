// Los datos del negocio en texto compacto, para que Claude conteste preguntas ("¿cuánto me deben?"). Solo lectura.
// Se mandan nombres de clientes y montos a la API de Claude con tu clave: por eso solo ocurre cuando tú preguntas.
import type { SQLiteDatabase } from 'expo-sqlite';

import { diasDesde, formatearFecha, moneda } from '../dinero';
import { listarFacturas, resumenFacturas } from './factura';
import { proyectosConResumen } from './resumen';

const MAX_FACTURAS = 150;

export async function datosParaPreguntar(db: SQLiteDatabase, hoy = new Date()): Promise<string> {
  const [facturas, resumen, cotizaciones, proyectos] = await Promise.all([
    listarFacturas(db),
    resumenFacturas(db),
    proyectosConResumen(db, 'activos', 'cotizacion'),
    proyectosConResumen(db, 'activos'),
  ]);
  const validas = facturas.filter((f) => !f.anulada);

  // lo facturado por mes (fecha de la factura)
  const porMes = new Map<string, number>();
  for (const f of validas) porMes.set(f.creado_en.slice(0, 7), (porMes.get(f.creado_en.slice(0, 7)) ?? 0) + f.total_cts);

  const filasFactura = validas.slice(0, MAX_FACTURAS).map((f) => {
    const saldo = Math.max(0, f.total_cts - f.pagado_cts);
    return `${f.ncf} | ${f.cliente} | ${f.proyecto} | total ${moneda(f.total_cts)} | saldo ${moneda(saldo)} | emitida ${f.creado_en.slice(0, 10)} | vence ${f.vence ?? 'sin fecha'}`;
  });
  const filasCotizacion = cotizaciones.map(({ proyecto: p, resumen: r }) => {
    const dias = diasDesde(p.enviada_en, hoy);
    return `${p.nombre} | ${p.cliente} | ${p.cot_estado} | total ${moneda(r.total_cts)}${p.cot_estado === 'enviada' && dias !== null ? ` | enviada hace ${dias} días` : ''}`;
  });
  const filasProyecto = proyectos.map(({ proyecto: p, resumen: r }) => `${p.nombre} | ${p.cliente} | ${p.estado} | total ${moneda(r.total_cts)}${r.factura ? ` | factura ${r.factura.ncf}, saldo ${moneda(r.factura.saldo_cts)}` : ' | sin factura'}`);

  return [
    `Fecha de hoy: ${hoy.toLocaleDateString('en-CA')} (${formatearFecha(hoy.toLocaleDateString('en-CA'))})`,
    `TOTALES: por cobrar ${moneda(resumen.por_cobrar)} | vencido ${moneda(resumen.vencido)} | cobrado en total ${moneda(resumen.cobrado)} | cobrado este mes ${moneda(resumen.cobrado_mes)}`,
    `FACTURADO POR MES (todas las facturas no anuladas):\n${[...porMes].sort().map(([m, t]) => `${m}: ${moneda(t)}`).join('\n') || 'ninguna'}`,
    `FACTURAS (ncf | cliente | proyecto | total | saldo | emitida | vence) — ${validas.length > MAX_FACTURAS ? `las ${MAX_FACTURAS} más recientes de ${validas.length}` : 'todas'}:\n${filasFactura.join('\n') || 'ninguna'}`,
    `COTIZACIONES SIN APROBAR (nombre | cliente | estado | total):\n${filasCotizacion.join('\n') || 'ninguna'}`,
    `PROYECTOS EN CURSO (nombre | cliente | estado | total):\n${filasProyecto.join('\n') || 'ninguno'}`,
  ].join('\n\n');
}

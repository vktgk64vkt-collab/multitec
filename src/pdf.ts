import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { obtenerNegocio, type Negocio } from './db/negocio';
import { formatear, importe } from './dinero';
import { uriFoto } from './fotos';
import type { SQLiteDatabase } from 'expo-sqlite';
import { File } from 'expo-file-system';

export interface DatosPdf {
  titulo: string;
  ncf?: string;
  fecha?: string;
  vence?: string | null;
  negocio?: (Negocio & { logo_base64?: string }) | null;
  cliente: string;
  rnc?: string | null;
  proyecto: string;
  lineas: { descripcion: string; cantidad: number; precio_cts: number; descuento_pct?: number; tipo?: string }[];
  subtotal: number;
  impuesto: number;
  total: number;
  condiciones?: string | null;
  preciosConItbis?: boolean;
  pagos?: { fecha: string; monto_cts: number }[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cabeceraNegocio(n?: DatosPdf['negocio']) {
  if (!n || !(n.nombre || n.logo_base64)) return '';
  const lineas = [n.rnc && `RNC: ${n.rnc}`, n.telefono, n.correo, n.direccion].filter(Boolean).map((t) => esc(String(t)));
  return `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">
    ${n.logo_base64 ? `<img src="data:image/jpeg;base64,${n.logo_base64}" style="height:56px">` : ''}
    <div><b>${esc(n.nombre ?? '')}</b><br>${lineas.join('<br>')}</div></div>`;
}

/** Datos del negocio para el encabezado del PDF, con el logo embebido. */
export async function negocioParaPdf(db: SQLiteDatabase): Promise<DatosPdf['negocio']> {
  const n = await obtenerNegocio(db);
  if (!n) return null;
  try {
    const logo_base64 = n.logo_uri ? await new File(uriFoto(n.logo_uri)).base64() : undefined;
    return { ...n, logo_base64 };
  } catch {
    return n; // logo borrado o ilegible: el PDF sale sin él
  }
}

const fila = (l: DatosPdf['lineas'][number]) =>
  `<tr><td>${esc(l.descripcion)}</td><td class="n">${l.cantidad}</td>
    <td class="n">${formatear(l.precio_cts)}</td><td class="n">${l.descuento_pct ? `${l.descuento_pct}%` : ''}</td><td class="n">${formatear(importe(l))}</td></tr>`;

/** Con equipos y servicios a la vez, separa en dos secciones con su subtotal; si no, una tabla simple. */
function filasPorSeccion(lineas: DatosPdf['lineas']) {
  const equipos = lineas.filter((l) => l.tipo !== 'servicio');
  const servicios = lineas.filter((l) => l.tipo === 'servicio');
  if (equipos.length === 0 || servicios.length === 0) return lineas.map(fila).join('');
  const seccion = (titulo: string, ls: DatosPdf['lineas']) =>
    `<tr><td colspan="5" class="sec">${titulo}</td></tr>${ls.map(fila).join('')}
     <tr><td colspan="4" class="n"><i>Subtotal ${titulo.toLowerCase()}</i></td><td class="n"><i>${formatear(ls.reduce((s, l) => s + importe(l), 0))}</i></td></tr>`;
  return seccion('Equipos', equipos) + seccion('Mano de obra y servicios', servicios);
}

function html(d: DatosPdf) {
  const filas = filasPorSeccion(d.lineas);
  const pagado = (d.pagos ?? []).reduce((s, p) => s + p.monto_cts, 0);
  const pagos = d.pagos?.length
    ? `<div class="t">${d.pagos.map((p) => `Pago ${esc(p.fecha)}: ${formatear(p.monto_cts)}`).join('<br>')}
        <div><b>Saldo: ${formatear(Math.max(0, d.total - pagado))}</b></div></div>`
    : '';
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:8px;border-bottom:1px solid #ccc;text-align:left} .n{text-align:right}
    .t{margin-top:16px;text-align:right;line-height:1.6} .total{font-size:20px;font-weight:700}
    .sec{background:#f2f4f7;font-weight:700} .cond{margin-top:24px;font-size:12px;color:#444}
  </style></head><body>
    ${cabeceraNegocio(d.negocio)}
    <h1>${esc(d.titulo)}</h1>
    ${d.ncf ? `<div>NCF: ${esc(d.ncf)}</div>` : ''}${d.fecha ? `<div>${esc(d.fecha)}</div>` : ''}${d.vence ? `<div>Vence: ${esc(d.vence)}</div>` : ''}
    <p><b>${esc(d.cliente)}</b>${d.rnc ? `<br>RNC/Cédula: ${esc(d.rnc)}` : ''}<br>Proyecto: ${esc(d.proyecto)}</p>
    <table><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Desc.</th><th class="n">Importe</th></tr>${filas}</table>
    <div class="t">Subtotal: ${formatear(d.subtotal)}<br>ITBIS: ${formatear(d.impuesto)}
      <div class="total">Total: ${formatear(d.total)}</div></div>
    ${d.preciosConItbis ? '<p class="cond">Los precios de las líneas incluyen ITBIS.</p>' : ''}
    ${pagos}
    ${d.condiciones ? `<p class="cond"><b>Condiciones</b><br>${esc(d.condiciones).replace(/\n/g, '<br>')}</p>` : ''}
  </body></html>`;
}

/** Genera el PDF y abre la hoja de compartir de iOS. Devuelve false si el dispositivo no puede (p. ej. web). */
export async function compartirPdf(d: DatosPdf) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html: html(d) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return true;
}

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatear } from './dinero';

export interface DatosPdf {
  titulo: string;
  ncf?: string;
  fecha?: string;
  cliente: string;
  rnc?: string | null;
  proyecto: string;
  lineas: { descripcion: string; cantidad: number; precio_cts: number }[];
  subtotal: number;
  impuesto: number;
  total: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function html(d: DatosPdf) {
  const filas = d.lineas
    .map(
      (l) => `<tr><td>${esc(l.descripcion)}</td><td class="n">${l.cantidad}</td>
        <td class="n">${formatear(l.precio_cts)}</td><td class="n">${formatear(l.cantidad * l.precio_cts)}</td></tr>`
    )
    .join('');
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:8px;border-bottom:1px solid #ccc;text-align:left} .n{text-align:right}
    .t{margin-top:16px;text-align:right;line-height:1.6} .total{font-size:20px;font-weight:700}
  </style></head><body>
    <h1>${esc(d.titulo)}</h1>
    ${d.ncf ? `<div>NCF: ${esc(d.ncf)}</div>` : ''}${d.fecha ? `<div>${esc(d.fecha)}</div>` : ''}
    <p><b>${esc(d.cliente)}</b>${d.rnc ? `<br>RNC/Cédula: ${esc(d.rnc)}` : ''}<br>Proyecto: ${esc(d.proyecto)}</p>
    <table><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr>${filas}</table>
    <div class="t">Subtotal: ${formatear(d.subtotal)}<br>ITBIS: ${formatear(d.impuesto)}
      <div class="total">Total: ${formatear(d.total)}</div></div>
  </body></html>`;
}

/** Genera el PDF y abre la hoja de compartir de iOS. Devuelve false si el dispositivo no puede (p. ej. web). */
export async function compartirPdf(d: DatosPdf) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html: html(d) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return true;
}

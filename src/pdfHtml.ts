// Plantilla HTML de cotización, propuesta y factura, lo mínimo necesario. La identidad (logo, nombre y color) sale del perfil de la
// empresa del usuario; no hay ninguna marca fija. Sin dependencias de React Native ni de Expo, para poder probarla.
import type { Negocio } from './db/negocio';
import { agruparLineas, formatear, importe, itbisLinea, moneda, sinArea } from './dinero';
import { paleta } from './marca';
import { agruparPorTrabajo, etiquetaTrabajo } from './trabajos';

export interface DatosPdf {
  titulo: string;
  ncf?: string;
  numero?: string; // número interno de la factura (F-000001)
  fecha?: string;
  vence?: string | null;
  negocio?: (Negocio & { logo_base64?: string }) | null;
  cliente: string;
  rnc?: string | null;
  proyecto: string;
  lineas: { descripcion: string; detalle?: string | null; cantidad: number; precio_cts: number; descuento_pct?: number; tipo?: string; trabajo?: string | null }[];
  subtotal: number;
  /** Descuento global (sin impuesto) y su porcentaje; opcional. */
  descuento?: number;
  descuentoPct?: number;
  impuesto: number;
  total: number;
  /** Para mostrar el ITBIS de cada línea. */
  impuestoPct?: number;
  condiciones?: string | null;
  preciosConItbis?: boolean;
  pagos?: { fecha: string; monto_cts: number }[];
  /** Propuesta: se listan equipos y servicios (con cantidad) pero sin precios por línea; solo el total. */
  sinPrecios?: boolean;
  intro?: string | null;
  /** Áreas del levantamiento: el documento no las muestra; se quitan del texto de líneas antiguas que las traían. */
  areas?: string[];
}

type Linea = DatosPdf['lineas'][number];
type Paleta = ReturnType<typeof paleta>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const parrafos = (s: string) => esc(s).replace(/\n/g, '<br>');
const mimeLogo = (b64: string) => (b64.startsWith('/9j/') ? 'image/jpeg' : 'image/png');

/** Logo de la empresa; si no tiene, su nombre como texto; si tampoco, nada. Seguido de sus datos de contacto. */
function encabezadoEmpresa(n: DatosPdf['negocio']) {
  const marca = n?.logo_base64
    ? `<img class="logo" src="data:${mimeLogo(n.logo_base64)};base64,${n.logo_base64}" alt="${esc(n.nombre ?? '')}">`
    : n?.nombre
      ? `<div class="nombre-empresa">${esc(n.nombre)}</div>`
      : '';
  const datos = [
    n?.logo_base64 && n.nombre ? `<b>${esc(n.nombre)}</b>` : '', // con logo, el nombre va en los datos; sin logo ya es el título
    n?.rnc ? `RNC: ${esc(n.rnc)}` : '',
    n?.telefono ? esc(n.telefono) : '',
    n?.correo ? esc(n.correo) : '',
    n?.direccion ? esc(n.direccion) : '',
  ].filter(Boolean);
  return `<div class="empresa">${marca}${datos.length ? `<div class="datos">${datos.join('<br>')}</div>` : ''}</div>`;
}

/** "Cotización #12" -> tipo "Cotización", número "#12"; "Factura (ANULADA)" -> sello. */
function partesTitulo(titulo: string) {
  const m = titulo.match(/^(.*?)\s*(#\d+)?\s*(\(ANULADA\))?$/);
  return { tipo: m?.[1] || titulo, numero: m?.[2] ?? '', anulada: !!m?.[3] };
}

const descripcion = (l: Linea) =>
  `${esc(l.descripcion)}${l.detalle ? `<div class="det">${parrafos(l.detalle)}</div>` : ''}`;

/** Datos para el ITBIS por línea: sin ellos esa columna sale vacía. */
interface Itbis {
  pct?: number;
  incluido: boolean;
}

const fila = (l: Linea, sinPrecios: boolean, itbis: Itbis) =>
  sinPrecios
    ? `<tr><td class="n cant">${l.cantidad}</td><td>${descripcion(l)}</td></tr>`
    : `<tr><td>${descripcion(l)}</td><td class="n">${l.cantidad}</td>
    <td class="n">${formatear(l.descuento_pct ? Math.round(importe(l) / (l.cantidad || 1)) : l.precio_cts)}</td><td class="n">${itbis.pct === undefined ? '' : formatear(itbisLinea(importe(l), itbis.pct, itbis.incluido))}</td><td class="n imp">${formatear(importe(l))}</td></tr>`;

/**
 * Con varios trabajos (alarma, cámaras, portón...) una sección por trabajo; si no, con equipos y servicios a la vez, dos secciones.
 * Cada sección lleva su subtotal solo si se muestran precios.
 */
function filasPorSeccion(lineas: Linea[], sinPrecios: boolean, itbis: Itbis) {
  const cols = sinPrecios ? 2 : 5;
  const seccion = (titulo: string, ls: Linea[]) =>
    `<tr class="seccion"><td colspan="${cols}">${esc(titulo)}</td></tr>${ls.map((l) => fila(l, sinPrecios, itbis)).join('')}` +
    (sinPrecios
      ? ''
      : `<tr class="sub"><td colspan="4" class="n">Subtotal ${esc(titulo.toLowerCase())}</td><td class="n">${formatear(ls.reduce((s, l) => s + importe(l), 0))}</td></tr>`);

  const trabajos = agruparPorTrabajo(lineas);
  if (trabajos.length > 1) return trabajos.map((g) => seccion(etiquetaTrabajo(g.trabajo), g.lineas)).join('');

  const equipos = lineas.filter((l) => l.tipo !== 'servicio');
  const servicios = lineas.filter((l) => l.tipo === 'servicio');
  if (equipos.length === 0 || servicios.length === 0) return lineas.map((l) => fila(l, sinPrecios, itbis)).join('');
  return seccion('Equipos', equipos) + seccion('Mano de obra y servicios', servicios);
}

const estilos = (p: Paleta) => `
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:${p.texto};margin:0;font-size:11px;line-height:1.35}
  @page{margin:0} /* 18 px = 0,25 in: el mínimo que las impresoras pueden imprimir; menos se recorta */
  .pagina{padding:18px}
  .cabecera{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
  .logo{height:42px;max-width:220px;object-fit:contain;display:block}
  .nombre-empresa{font-size:20px;font-weight:700;color:${p.principal};letter-spacing:.5px}
  .datos{margin-top:4px;font-size:10px;color:#5a6a72;line-height:1.4}
  .doc{text-align:right}
  .tipo{font-size:20px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${p.principal};line-height:1.1}
  .numero{font-size:12px;font-weight:600;color:${p.oscuro};margin-top:4px}
  .meta{font-size:10px;color:#5a6a72;margin-top:2px}
  .sello{display:inline-block;margin-top:6px;padding:2px 10px;border:2px solid #b3261e;color:#b3261e;font-weight:700;letter-spacing:2px;border-radius:4px}
  .partes{display:flex;gap:18px;margin-top:12px}
  .parte{flex:1;border-left:3px solid ${p.claro};padding-left:10px}
  .rotulo{font-size:9.5px;letter-spacing:1.6px;color:${p.claro};font-weight:700;text-transform:uppercase}
  .valor{font-size:12.5px;font-weight:600;color:${p.oscuro};margin-top:2px}
  .sub-valor{font-size:10px;color:#5a6a72}
  .intro{margin:10px 0 0;padding:8px 10px;background:${p.suave};border-radius:6px;color:${p.oscuro}}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}
  th{background:${p.principal};color:${p.sobrePrincipal};font-size:10px;letter-spacing:.8px;text-transform:uppercase;text-align:left;padding:5px 8px}
  th:first-child{border-radius:6px 0 0 6px} th:last-child{border-radius:0 6px 6px 0}
  td{padding:5px 8px;border-bottom:1px solid ${p.linea};vertical-align:top}
  tr{page-break-inside:avoid}
  .n{text-align:right;white-space:nowrap} th.n{text-align:right}
  .cant{width:56px;font-weight:700;color:${p.principal}}
  .imp{font-weight:600}
  .det{font-size:10.5px;color:#5a6a72;margin-top:2px}
  .seccion td{background:${p.suave};color:${p.oscuro};font-weight:700;letter-spacing:.6px;text-transform:uppercase;font-size:10.5px;border-bottom:none}
  .sub td{font-style:italic;color:${p.oscuro}}
  .totales{margin:10px 0 0 auto;width:260px;page-break-inside:avoid}
  .linea{display:flex;justify-content:space-between;padding:2px 2px;color:${p.oscuro}}
  .gran{display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding:8px 12px;background:${p.principal};color:${p.sobrePrincipal};border-radius:6px;font-size:14px;font-weight:700}
  .gran small{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:.85}
  .caja{margin-top:10px;padding:7px 10px;background:${p.suave};border-left:3px solid ${p.principal};border-radius:4px;font-size:10px;page-break-inside:avoid}
  .caja b{display:block;margin-bottom:3px;font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;color:${p.principal}}
`;

export function htmlDocumento(d: DatosPdf) {
  const sp = !!d.sinPrecios;
  const p = paleta(d.negocio?.color);
  const { tipo, numero, anulada } = partesTitulo(d.titulo);
  const lineas = agruparLineas(d.lineas.map((l) => ({ ...l, descripcion: sinArea(l.descripcion, d.areas ?? []) })), sp); // sin texto repetido: las líneas iguales se suman
  const pagado = (d.pagos ?? []).reduce((s, x) => s + x.monto_cts, 0);
  const itbis: Itbis = { pct: d.impuestoPct, incluido: !!d.preciosConItbis };

  const tabla = sp
    ? `<table><tr><th class="n" style="width:56px">Cant.</th><th>Descripción</th></tr>${filasPorSeccion(lineas, true, itbis)}</table>`
    : `<table><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">ITBIS</th><th class="n">Importe</th></tr>${filasPorSeccion(lineas, false, itbis)}</table>`;

  const totales = sp
    ? `<div class="totales"><div class="gran"><small>Total (ITBIS incluido)</small><span>${moneda(d.total)}</span></div></div>`
    : `<div class="totales">
        <div class="linea"><span>Subtotal</span><span>${moneda(d.subtotal)}</span></div>
        ${d.descuento ? `<div class="linea"><span>Descuento${d.descuentoPct ? ` (${d.descuentoPct}%)` : ''}</span><span>−${moneda(d.descuento)}</span></div>` : ''}
        <div class="linea"><span>ITBIS</span><span>${moneda(d.impuesto)}</span></div>
        <div class="gran"><small>Total</small><span>${moneda(d.total)}</span></div>
      </div>`;

  const pagos = d.pagos?.length
    ? `<div class="caja"><b>Pagos recibidos</b>${d.pagos.map((x) => `${esc(x.fecha)}: ${moneda(x.monto_cts)}`).join('<br>')}
        <br><strong>Saldo pendiente: ${moneda(Math.max(0, d.total - pagado))}</strong></div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${estilos(p)}</style></head><body>
    <div class="pagina">
      <div class="cabecera">
        ${encabezadoEmpresa(d.negocio)}
        <div class="doc">
          <div class="tipo">${esc(tipo)}</div>
          ${numero ? `<div class="numero">${esc(numero)}</div>` : ''}
          ${d.numero ? `<div class="numero">No. ${esc(d.numero)}</div>` : ''}
          ${d.ncf ? `<div class="numero">NCF ${esc(d.ncf)}</div>` : ''}
          ${d.fecha ? `<div class="meta">Fecha: ${esc(d.fecha)}</div>` : ''}
          ${d.vence ? `<div class="meta">Vence: ${esc(d.vence)}</div>` : ''}
          ${anulada ? '<div class="sello">ANULADA</div>' : ''}
        </div>
      </div>
      <div class="partes">
        <div class="parte"><div class="rotulo">Cliente</div><div class="valor">${esc(d.cliente)}</div>${d.rnc ? `<div class="sub-valor">RNC/Cédula: ${esc(d.rnc)}</div>` : ''}</div>
      </div>
      ${d.intro ? `<p class="intro">${parrafos(d.intro)}</p>` : ''}
      ${tabla}
      ${totales}
      ${d.preciosConItbis && !sp ? '<div class="meta" style="text-align:right;margin-top:4px">Los precios de las líneas incluyen ITBIS.</div>' : ''}
      ${pagos}
      ${d.condiciones ? `<div class="caja"><b>Condiciones</b>${parrafos(d.condiciones)}</div>` : ''}
    </div>
  </body></html>`;
}

/**
 * Nombre con el que se guarda y se comparte el PDF: "Cotización 12 - Cliente - Proyecto.pdf"; las facturas llevan su NCF.
 * Sin caracteres que los archivos no admiten y con un largo razonable.
 */
export function nombreArchivoPdf(d: DatosPdf): string {
  const { tipo, numero, anulada } = partesTitulo(d.titulo);
  const identificador = d.numero ?? d.ncf ?? numero.replace('#', '');
  const limpio = (t: string) => t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const partes = [`${tipo}${identificador ? ` ${identificador}` : ''}${anulada ? ' (ANULADA)' : ''}`, d.cliente, d.proyecto].map(limpio).filter(Boolean);
  return `${partes.join(' - ').slice(0, 120).trim()}.pdf`;
}

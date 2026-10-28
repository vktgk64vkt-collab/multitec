/** "12.5" -> 1250. Devuelve null si no es un monto válido (>= 0). */
export function aCentavos(texto: string): number | null {
  const t = texto.trim();
  return /^\d+([.,]\d+)?$/.test(t) ? Math.round(Number(t.replace(',', '.')) * 100) : null;
}

export function formatear(centavos: number): string {
  // manual, sin Intl: el formato dominicano (1,500.00) no debe cambiar con el idioma del teléfono
  const [entero, decimales] = (centavos / 100).toFixed(2).split('.');
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

type Item = { cantidad: number; precio_cts: number; descuento_pct?: number };

/** Importe de una línea con su descuento (%) ya aplicado, en centavos. */
export function importe(i: Item): number {
  return Math.round((i.cantidad * i.precio_cts * (100 - (i.descuento_pct ?? 0))) / 100);
}

/**
 * Con `incluido` los precios de las líneas ya traen el impuesto: el total es la suma de las líneas
 * y el subtotal/impuesto se desglosan hacia atrás. Sin él, el impuesto se suma encima (modo anterior).
 * `descuentoPct` es el descuento global del documento: se resta del subtotal (sin impuesto) y el ITBIS se calcula sobre lo que queda.
 * Siempre se cumple subtotal - descuento + impuesto = total.
 */
export function totales(items: Item[], impuestoPct: number, incluido = false, descuentoPct = 0) {
  const suma = items.reduce((s, i) => s + importe(i), 0);
  const quedan = (100 - descuentoPct) / 100;
  if (incluido) {
    const total = Math.round(suma * quedan);
    const subtotal = Math.round(suma / (1 + impuestoPct / 100));
    const neto = Math.round(total / (1 + impuestoPct / 100));
    return { subtotal, descuento: subtotal - neto, impuesto: total - neto, total };
  }
  const neto = Math.round(suma * quedan);
  const impuesto = Math.round((neto * impuestoPct) / 100);
  return { subtotal: suma, descuento: suma - neto, impuesto, total: neto + impuesto };
}

/** ITBIS contenido en el importe de una línea (para mostrarlo por línea en los documentos). */
export function itbisLinea(importeCts: number, impuestoPct: number, incluido: boolean): number {
  return incluido ? importeCts - Math.round(importeCts / (1 + impuestoPct / 100)) : Math.round((importeCts * impuestoPct) / 100);
}

export const ITBIS_PCT = 18;
export const MARGENES_BASE = [15, 17.5, 20] as const;

interface ConPrecios {
  costo_cts: number;
  precio_cts: number;
  margen1_pct: number | null;
  margen2_pct: number | null;
  margen3_pct: number | null;
}

/** Precio de venta: costo + margen % + impuesto (18 % por defecto; 0 para el precio sin ITBIS), en centavos. */
export function precioDesdeCosto(costoCts: number, margenPct: number, impuestoPct = ITBIS_PCT): number {
  return Math.round(costoCts * (1 + margenPct / 100) * (1 + impuestoPct / 100));
}

/**
 * Los 3 precios del artículo. Si tiene costo y márgenes se calculan; si no (artículos manuales o
 * anteriores), los tres son el precio fijo escrito a mano.
 */
export function preciosArticulo(p: ConPrecios): [number, number, number] {
  const m = [p.margen1_pct, p.margen2_pct, p.margen3_pct];
  if (p.costo_cts <= 0 || m[0] === null) return [p.precio_cts, p.precio_cts, p.precio_cts];
  return m.map((x) => precioDesdeCosto(p.costo_cts, x ?? (m[0] as number))) as [number, number, number];
}

/**
 * Precio del nivel (1-3) listo para usar en un proyecto. Los artículos calculados llevan el impuesto del proyecto
 * dentro del precio solo si el proyecto trabaja con precios con ITBIS incluido; los de precio fijo no cambian.
 */
export function precioParaProyecto(p: ConPrecios, nivel: number, conItbis: boolean, impuestoPct = ITBIS_PCT): number {
  const i = Math.min(3, Math.max(1, nivel)) - 1;
  if (p.costo_cts <= 0 || p.margen1_pct === null) return p.precio_cts;
  const m = [p.margen1_pct, p.margen2_pct ?? p.margen1_pct, p.margen3_pct ?? p.margen1_pct][i];
  return precioDesdeCosto(p.costo_cts, m, conItbis ? impuestoPct : 0);
}

/** Monto con la moneda: "RD$ 1,500.00". */
export function moneda(centavos: number): string {
  return `RD$ ${formatear(centavos)}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-10-27 10:04:12" -> "27 oct 2026" (o "27 oct 2026, 10:04" con hora). Si no reconoce el formato, lo devuelve igual. */
export function formatearFecha(texto: string | null | undefined, conHora = false): string {
  const m = texto?.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return texto ?? '';
  const dia = `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
  return conHora && m[4] ? `${dia}, ${m[4]}:${m[5]}` : dia;
}

/** Fecha local AAAA-MM-DD de hoy más `dias` días. */
export function fechaEn(dias: number, desde = new Date()): string {
  const f = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

type LineaAgrupable = { descripcion: string; detalle?: string | null; cantidad: number; precio_cts: number; descuento_pct?: number; tipo?: string; trabajo?: string | null };

/**
 * Junta las líneas repetidas (mismo texto, tipo, precio y descuento) sumando sus cantidades, para no repetir texto
 * en pantalla ni en los documentos. Con `sinPrecios` (propuesta) el precio y el descuento no cuentan al comparar.
 */
export function agruparLineas<T extends LineaAgrupable>(lineas: T[], sinPrecios = false): T[] {
  const grupos = new Map<string, T>();
  for (const l of lineas) {
    const clave = [
      l.descripcion.trim().toLowerCase(),
      (l.detalle ?? '').trim().toLowerCase(),
      l.tipo ?? 'equipo',
      (l.trabajo ?? '').trim().toLowerCase(),
      sinPrecios ? '' : l.precio_cts,
      sinPrecios ? '' : (l.descuento_pct ?? 0),
    ].join('|');
    const previa = grupos.get(clave);
    grupos.set(clave, previa ? { ...previa, cantidad: previa.cantidad + l.cantidad } : { ...l });
  }
  return [...grupos.values()];
}

/**
 * Quita el " (Área)" del final de una descripción. Las cotizaciones hechas antes de sumar las líneas traían el área
 * en el texto ("Cámara IP (Entrada)"); solo se quita si coincide con un área del proyecto, nunca por adivinar.
 */
export function sinArea(descripcion: string, areas: string[]): string {
  const d = descripcion.trimEnd();
  for (const a of areas) {
    const sufijo = ` (${a.trim()})`;
    if (a.trim() && d.toLowerCase().endsWith(sufijo.toLowerCase())) return d.slice(0, d.length - sufijo.length).trimEnd();
  }
  return descripcion;
}

/** Días completos desde una fecha "AAAA-MM-DD[ hora]" hasta hoy (0 si es hoy o futura). null si no se reconoce la fecha. */
export function diasDesde(texto: string | null | undefined, hoy = new Date()): number | null {
  const m = texto?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const dia = (a: number, b: number, c: number) => Date.UTC(a, b, c);
  return Math.max(0, Math.round((dia(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - dia(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / 86_400_000));
}

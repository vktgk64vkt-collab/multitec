/** "12.5" -> 1250. Devuelve null si no es un monto válido (>= 0). */
export function aCentavos(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
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
 */
export function totales(items: Item[], impuestoPct: number, incluido = false) {
  const suma = items.reduce((s, i) => s + importe(i), 0);
  if (incluido) {
    const subtotal = Math.round(suma / (1 + impuestoPct / 100));
    return { subtotal, impuesto: suma - subtotal, total: suma };
  }
  const impuesto = Math.round((suma * impuestoPct) / 100);
  return { subtotal: suma, impuesto, total: suma + impuesto };
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

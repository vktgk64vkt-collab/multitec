/** "12.5" -> 1250. Devuelve null si no es un monto válido (>= 0). */
export function aCentavos(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function formatear(centavos: number): string {
  return (centavos / 100).toLocaleString('es', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** Precio de venta con ITBIS incluido: costo + margen % + ITBIS, en centavos. */
export function precioDesdeCosto(costoCts: number, margenPct: number): number {
  return Math.round(costoCts * (1 + margenPct / 100) * (1 + ITBIS_PCT / 100));
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

/** Precio del nivel (1-3) listo para usar en un proyecto: sin ITBIS si el proyecto no lo incluye en los precios. */
export function precioParaProyecto(p: ConPrecios, nivel: number, conItbis: boolean): number {
  const precio = preciosArticulo(p)[Math.min(3, Math.max(1, nivel)) - 1];
  const calculado = p.costo_cts > 0 && p.margen1_pct !== null;
  return calculado && !conItbis ? Math.round(precio / (1 + ITBIS_PCT / 100)) : precio;
}

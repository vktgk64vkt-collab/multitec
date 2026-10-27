/** "12.5" -> 1250. Devuelve null si no es un monto válido (>= 0). */
export function aCentavos(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function formatear(centavos: number): string {
  return (centavos / 100).toLocaleString('es', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function totales(items: { cantidad: number; precio_cts: number }[], impuestoPct: number) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio_cts, 0);
  const impuesto = Math.round((subtotal * impuestoPct) / 100);
  return { subtotal, impuesto, total: subtotal + impuesto };
}

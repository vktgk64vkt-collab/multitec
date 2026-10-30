export interface VentaFila {
  creado_en: string;
  numero: string;
  ncf: string;
  cliente: string;
  id_fiscal: string | null;
  subtotal_cts: number;
  descuento_cts: number;
  impuesto_cts: number;
  total_cts: number;
  anulada: number;
}

const celda = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const dinero = (cts: number) => (cts / 100).toFixed(2);

/** CSV de ventas para el contador (base del 607). Una factura anulada sale con montos en cero. */
export function ventasCsv(filas: VentaFila[]): string {
  const cab = 'Fecha,Factura,NCF,Cliente,RNC/Cédula,Subtotal,Descuento,ITBIS,Total,Estado';
  const lineas = filas.map((f) => {
    const a = f.anulada === 1;
    return [f.creado_en.slice(0, 10), f.numero, f.ncf === '00000000' ? '' : f.ncf, f.cliente, f.id_fiscal ?? '', ...[f.subtotal_cts, f.descuento_cts, f.impuesto_cts, f.total_cts].map((n) => dinero(a ? 0 : n)), a ? 'Anulada' : 'Válida']
      .map((v) => celda(String(v)))
      .join(',');
  });
  return '﻿' + [cab, ...lineas].join('\r\n') + '\r\n'; // BOM: Excel abre los acentos bien
}

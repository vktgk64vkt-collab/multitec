import type { SQLiteDatabase } from 'expo-sqlite';

import type { VentaFila } from '@/ventasCsv';

export interface Reporte {
  porMes: { mes: string; total_cts: number }[];
  porCliente: { cliente: string; total_cts: number }[];
}

/** Facturado por mes (últimos 6 con facturas) y top 5 clientes por monto facturado. */
export async function reporte(db: SQLiteDatabase): Promise<Reporte> {
  return {
    porMes: await db.getAllAsync(
      `SELECT strftime('%Y-%m', creado_en) AS mes, SUM(total_cts) AS total_cts
       FROM facturas WHERE anulada = 0 GROUP BY mes ORDER BY mes DESC LIMIT 6`
    ),
    porCliente: await db.getAllAsync(
      `SELECT c.nombre AS cliente, SUM(f.total_cts) AS total_cts
       FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id
       WHERE f.anulada = 0 GROUP BY c.id ORDER BY total_cts DESC LIMIT 5`
    ),
  };
}

/** Facturas del año (o todas si `anio` es null) con los datos que pide el contador. */
export function ventasDelAnio(db: SQLiteDatabase, anio: number) {
  return db.getAllAsync<VentaFila>(
    `SELECT f.creado_en, f.numero, f.ncf, c.nombre AS cliente, c.id_fiscal, f.subtotal_cts, f.descuento_cts, f.impuesto_cts, f.total_cts, f.anulada
     FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id
     WHERE strftime('%Y', f.creado_en) = ? ORDER BY f.creado_en`,
    String(anio)
  );
}

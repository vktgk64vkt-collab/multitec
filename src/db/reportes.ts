import type { SQLiteDatabase } from 'expo-sqlite';

export interface Reporte {
  porMes: { mes: string; total_cts: number }[];
  porCliente: { cliente: string; total_cts: number }[];
}

/** Facturado por mes (últimos 6 con facturas) y top 5 clientes por monto facturado. */
export async function reporte(db: SQLiteDatabase): Promise<Reporte> {
  return {
    porMes: await db.getAllAsync(
      `SELECT strftime('%Y-%m', creado_en) AS mes, SUM(total_cts) AS total_cts
       FROM facturas GROUP BY mes ORDER BY mes DESC LIMIT 6`
    ),
    porCliente: await db.getAllAsync(
      `SELECT c.nombre AS cliente, SUM(f.total_cts) AS total_cts
       FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id
       GROUP BY c.id ORDER BY total_cts DESC LIMIT 5`
    ),
  };
}

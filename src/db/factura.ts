import type { SQLiteDatabase } from 'expo-sqlite';

import { totales } from '@/dinero';
import { listarLineas, obtenerImpuesto, type Linea } from './cotizacion';

export interface Factura {
  id: number;
  proyecto_id: number;
  ncf: string;
  subtotal_cts: number;
  impuesto_cts: number;
  total_cts: number;
  pagada: number;
  creado_en: string;
  proyecto: string;
  cliente: string;
  id_fiscal: string | null;
}

// NCF tradicional (B01 + 8 dígitos) o e-NCF (E31 + 10 dígitos)
export const NCF_VALIDO = /^(B\d{2}\d{8}|E\d{2}\d{10})$/;

export function obtenerFactura(db: SQLiteDatabase, proyectoId: number) {
  return db.getFirstAsync<Factura>(
    `SELECT f.*, p.nombre AS proyecto, c.nombre AS cliente, c.id_fiscal
     FROM facturas f
     JOIN proyectos p ON p.id = f.proyecto_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE f.proyecto_id = ?`,
    proyectoId
  );
}

export function listarLineasFactura(db: SQLiteDatabase, facturaId: number) {
  return db.getAllAsync<Pick<Linea, 'descripcion' | 'cantidad' | 'precio_cts'>>(
    'SELECT descripcion, cantidad, precio_cts FROM factura_items WHERE factura_id = ? ORDER BY id',
    facturaId
  );
}

/** Congela líneas y totales de la cotización actual. Devuelve false si no hay nada que facturar. */
export async function crearFactura(db: SQLiteDatabase, proyectoId: number, ncf: string) {
  const lineas = await listarLineas(db, proyectoId);
  const t = totales(lineas, await obtenerImpuesto(db, proyectoId));
  if (t.total <= 0) return false;
  await db.withTransactionAsync(async () => {
    const f = await db.runAsync(
      'INSERT INTO facturas (proyecto_id, ncf, subtotal_cts, impuesto_cts, total_cts) VALUES (?, ?, ?, ?, ?)',
      proyectoId, ncf, t.subtotal, t.impuesto, t.total
    );
    for (const l of lineas) {
      await db.runAsync(
        'INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_cts) VALUES (?, ?, ?, ?)',
        f.lastInsertRowId, l.descripcion, l.cantidad, l.precio_cts
      );
    }
    await db.runAsync("UPDATE proyectos SET estado = 'facturado' WHERE id = ?", proyectoId);
  });
  return true;
}

export function marcarPagada(db: SQLiteDatabase, id: number, pagada: boolean) {
  return db.runAsync('UPDATE facturas SET pagada = ? WHERE id = ?', pagada ? 1 : 0, id);
}

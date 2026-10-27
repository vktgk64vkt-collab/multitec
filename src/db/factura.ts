import type { SQLiteDatabase } from 'expo-sqlite';

import { totales } from '@/dinero';
import { listarLineas, obtenerOpciones, type Linea } from './cotizacion';

export interface Factura {
  id: number;
  proyecto_id: number;
  ncf: string;
  subtotal_cts: number;
  impuesto_cts: number;
  total_cts: number;
  pagada: number;
  vence: string | null;
  creado_en: string;
  proyecto: string;
  cliente: string;
  id_fiscal: string | null;
  telefono: string | null;
}

// NCF tradicional (B01 + 8 dígitos) o e-NCF (E31 + 10 dígitos)
export const NCF_VALIDO = /^(B\d{2}\d{8}|E\d{2}\d{10})$/;

export function obtenerFactura(db: SQLiteDatabase, proyectoId: number) {
  return db.getFirstAsync<Factura>(
    `SELECT f.*, p.nombre AS proyecto, c.nombre AS cliente, c.id_fiscal, c.telefono
     FROM facturas f
     JOIN proyectos p ON p.id = f.proyecto_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE f.proyecto_id = ?`,
    proyectoId
  );
}

export function listarLineasFactura(db: SQLiteDatabase, facturaId: number) {
  return db.getAllAsync<Pick<Linea, 'descripcion' | 'cantidad' | 'precio_cts' | 'descuento_pct' | 'tipo'>>(
    'SELECT descripcion, cantidad, precio_cts, descuento_pct, tipo FROM factura_items WHERE factura_id = ? ORDER BY id',
    facturaId
  );
}

/** Congela líneas y totales de la cotización actual. Devuelve false si no hay nada que facturar. */
export async function crearFactura(db: SQLiteDatabase, proyectoId: number, ncf: string) {
  const lineas = await listarLineas(db, proyectoId);
  const op = await obtenerOpciones(db, proyectoId);
  const t = totales(lineas, op.impuesto_pct, op.con_itbis);
  if (t.total <= 0) return false;
  await db.withTransactionAsync(async () => {
    const f = await db.runAsync(
      "INSERT INTO facturas (proyecto_id, ncf, subtotal_cts, impuesto_cts, total_cts, vence) VALUES (?, ?, ?, ?, ?, date('now', 'localtime', '+30 days'))",
      proyectoId, ncf, t.subtotal, t.impuesto, t.total
    );
    for (const l of lineas) {
      await db.runAsync(
        'INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_cts, descuento_pct, tipo) VALUES (?, ?, ?, ?, ?, ?)',
        f.lastInsertRowId, l.descripcion, l.cantidad, l.precio_cts, l.descuento_pct, l.tipo
      );
      // el inventario baja al facturar (solo productos con stock controlado; nunca por debajo de 0)
      if (l.item_id !== null) {
        await db.runAsync('UPDATE catalogo SET stock = MAX(0, stock - ?) WHERE id = ? AND stock IS NOT NULL', l.cantidad, l.item_id);
      }
    }
    await db.runAsync("UPDATE proyectos SET estado = 'facturado' WHERE id = ?", proyectoId);
  });
  return true;
}

export interface Pago {
  id: number;
  monto_cts: number;
  creado_en: string;
}

export function listarPagos(db: SQLiteDatabase, facturaId: number) {
  return db.getAllAsync<Pago>('SELECT id, monto_cts, creado_en FROM pagos WHERE factura_id = ? ORDER BY id', facturaId);
}

// `pagada` se deriva de los pagos: queda en 1 cuando lo pagado cubre el total.
async function sincronizarPagada(db: SQLiteDatabase, facturaId: number) {
  await db.runAsync(
    `UPDATE facturas SET pagada = (total_cts <= (SELECT COALESCE(SUM(monto_cts), 0) FROM pagos WHERE factura_id = facturas.id))
     WHERE id = ?`,
    facturaId
  );
}

export async function registrarPago(db: SQLiteDatabase, facturaId: number, montoCts: number) {
  await db.runAsync('INSERT INTO pagos (factura_id, monto_cts) VALUES (?, ?)', facturaId, montoCts);
  await sincronizarPagada(db, facturaId);
}

export async function eliminarPago(db: SQLiteDatabase, facturaId: number, pagoId: number) {
  await db.runAsync('DELETE FROM pagos WHERE id = ?', pagoId);
  await sincronizarPagada(db, facturaId);
}

export async function resumenFacturas(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ total: number; cobrado: number }>(
    `SELECT COALESCE((SELECT SUM(total_cts) FROM facturas), 0) AS total,
            COALESCE((SELECT SUM(monto_cts) FROM pagos), 0) AS cobrado`
  );
  // vencido = saldo de las facturas con vence anterior a hoy
  const v = await db.getFirstAsync<{ vencido: number }>(
    `SELECT COALESCE(SUM(f.total_cts - COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0)), 0) AS vencido
     FROM facturas f WHERE f.pagada = 0 AND f.vence < date('now', 'localtime')`
  );
  return {
    por_cobrar: Math.max(0, (r?.total ?? 0) - (r?.cobrado ?? 0)),
    cobrado: r?.cobrado ?? 0,
    vencido: v?.vencido ?? 0,
  };
}

export function guardarVence(db: SQLiteDatabase, id: number, vence: string | null) {
  return db.runAsync('UPDATE facturas SET vence = ? WHERE id = ?', vence, id);
}

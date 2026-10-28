import type { SQLiteDatabase } from 'expo-sqlite';

import { totales } from '@/dinero';
import { obtenerOpciones, type Linea } from './cotizacion';
import { incrementarNcf } from '../ncf';
import { lineasParaFacturar } from './ejecucion';

export interface Factura {
  id: number;
  proyecto_id: number;
  ncf: string;
  subtotal_cts: number;
  impuesto_cts: number;
  descuento_cts: number;
  descuento_pct: number;
  total_cts: number;
  pagada: number;
  anulada: number;
  vence: string | null;
  creado_en: string;
  proyecto: string;
  cliente: string;
  id_fiscal: string | null;
  telefono: string | null;
}

// NCF tradicional (B01 + 8 dígitos) o e-NCF (E31 + 10 dígitos)
/** Factura sin comprobante fiscal: el NCF queda en ceros y puede repetirse. */
export const SIN_NCF = '00000000';

export const NCF_VALIDO = /^(B\d{2}\d{8}|E\d{2}\d{10})$/;

/** El NCF que toca después del último emitido (también cuenta el de una anulada: queda consumido). null si aún no hay ninguno. */
export async function siguienteNcf(db: SQLiteDatabase): Promise<string | null> {
  const r = await db.getFirstAsync<{ ncf: string }>('SELECT ncf FROM facturas WHERE ncf <> ? ORDER BY id DESC LIMIT 1', SIN_NCF);
  return incrementarNcf(r?.ncf);
}

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
  return db.getAllAsync<Pick<Linea, 'descripcion' | 'cantidad' | 'precio_cts' | 'descuento_pct' | 'tipo' | 'detalle' | 'trabajo'>>(
    'SELECT descripcion, cantidad, precio_cts, descuento_pct, tipo, detalle, trabajo FROM factura_items WHERE factura_id = ? ORDER BY id',
    facturaId
  );
}

export type ResultadoFactura = 'ok' | 'sin_monto' | 'ncf_repetido';

/** Congela líneas y totales de la cotización actual. */
export async function crearFactura(db: SQLiteDatabase, proyectoId: number, ncf: string): Promise<ResultadoFactura> {
  // las líneas de la ejecución si ya empezó; si no, las de la cotización
  const [{ lineas }, op] = await Promise.all([lineasParaFacturar(db, proyectoId), obtenerOpciones(db, proyectoId)]);
  const t = totales(lineas, op.impuesto_pct, op.con_itbis, op.descuento_pct);
  if (t.total <= 0) return 'sin_monto';
  // un NCF no se repite, tampoco el de una factura anulada (queda consumido)
  const usado = ncf !== SIN_NCF && (await db.getFirstAsync('SELECT 1 FROM facturas WHERE ncf = ?', ncf));
  if (usado) return 'ncf_repetido';
  await db.withTransactionAsync(async () => {
    const f = await db.runAsync(
      "INSERT INTO facturas (proyecto_id, ncf, subtotal_cts, descuento_cts, descuento_pct, impuesto_cts, total_cts, vence) VALUES (?, ?, ?, ?, ?, ?, ?, date('now', 'localtime', '+30 days'))",
      proyectoId, ncf, t.subtotal, t.descuento, op.descuento_pct, t.impuesto, t.total
    );
    for (const l of lineas) {
      await db.runAsync(
        'INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_cts, descuento_pct, tipo, detalle, item_id, trabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        f.lastInsertRowId, l.descripcion, l.cantidad, l.precio_cts, l.descuento_pct, l.tipo, l.detalle, l.item_id, l.trabajo
      );
      // el inventario baja al facturar (solo productos con stock controlado; nunca por debajo de 0)
      if (l.item_id !== null) {
        await db.runAsync('UPDATE catalogo SET stock = MAX(0, stock - ?) WHERE id = ? AND stock IS NOT NULL', l.cantidad, l.item_id);
      }
    }
    await db.runAsync("UPDATE proyectos SET estado = 'facturado' WHERE id = ?", proyectoId);
  });
  return 'ok';
}

/**
 * Anula la factura: devuelve el stock, libera el estado del proyecto y la saca de los totales.
 * El NCF queda consumido y el proyecto no se vuelve a facturar (se duplica el proyecto para eso).
 * Devuelve false si ya tiene pagos: hay que eliminarlos primero.
 */
export async function anularFactura(db: SQLiteDatabase, facturaId: number): Promise<boolean> {
  const pagos = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pagos WHERE factura_id = ?', facturaId);
  if ((pagos?.n ?? 0) > 0) return false;
  await db.withTransactionAsync(async () => {
    const f = await db.getFirstAsync<{ proyecto_id: number; anulada: number }>('SELECT proyecto_id, anulada FROM facturas WHERE id = ?', facturaId);
    if (!f || f.anulada) return;
    await db.runAsync('UPDATE facturas SET anulada = 1 WHERE id = ?', facturaId);
    // devuelve lo que bajó al facturar, según las líneas congeladas de la factura (las anteriores a esta versión no guardan el artículo)
    await db.runAsync(
      `UPDATE catalogo SET stock = stock + (
         SELECT COALESCE(SUM(i.cantidad), 0) FROM factura_items i WHERE i.factura_id = ?1 AND i.item_id = catalogo.id)
       WHERE stock IS NOT NULL AND id IN (SELECT item_id FROM factura_items WHERE factura_id = ?1 AND item_id IS NOT NULL)`,
      facturaId
    );
    await db.runAsync("UPDATE proyectos SET estado = 'cotizado' WHERE id = ?", f.proyecto_id);
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

/** Registra el pago. Devuelve false si supera el saldo o la factura está anulada. */
export async function registrarPago(db: SQLiteDatabase, facturaId: number, montoCts: number): Promise<boolean> {
  const f = await db.getFirstAsync<{ saldo: number; anulada: number }>(
    `SELECT f.total_cts - COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0) AS saldo, f.anulada
     FROM facturas f WHERE f.id = ?`,
    facturaId
  );
  if (!f || f.anulada || montoCts > f.saldo) return false;
  await db.runAsync('INSERT INTO pagos (factura_id, monto_cts) VALUES (?, ?)', facturaId, montoCts);
  await sincronizarPagada(db, facturaId);
  return true;
}

export async function eliminarPago(db: SQLiteDatabase, facturaId: number, pagoId: number) {
  await db.runAsync('DELETE FROM pagos WHERE id = ?', pagoId);
  await sincronizarPagada(db, facturaId);
}

// Solo facturas que se pueden ver en la app: no anuladas y con su proyecto y cliente todavía existentes.
const VISIBLES = `FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id WHERE f.anulada = 0`;

export async function resumenFacturas(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ total: number; cobrado: number }>(
    `SELECT COALESCE(SUM(f.total_cts), 0) AS total,
            COALESCE(SUM((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id)), 0) AS cobrado ${VISIBLES}`
  );
  // vencido = saldo de las facturas con vence anterior a hoy
  const v = await db.getFirstAsync<{ vencido: number }>(
    `SELECT COALESCE(SUM(f.total_cts - COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0)), 0) AS vencido
     ${VISIBLES} AND f.pagada = 0 AND f.vence < date('now', 'localtime')`
  );
  // lo cobrado en el mes en curso (por la fecha del pago)
  const m = await db.getFirstAsync<{ cobrado_mes: number }>(
    `SELECT COALESCE(SUM(p.monto_cts), 0) AS cobrado_mes FROM pagos p JOIN facturas f ON f.id = p.factura_id
     WHERE f.anulada = 0 AND p.creado_en >= date('now', 'localtime', 'start of month')`
  );
  return {
    por_cobrar: Math.max(0, (r?.total ?? 0) - (r?.cobrado ?? 0)),
    cobrado: r?.cobrado ?? 0,
    cobrado_mes: m?.cobrado_mes ?? 0,
    vencido: v?.vencido ?? 0,
  };
}

export function guardarVence(db: SQLiteDatabase, id: number, vence: string | null) {
  return db.runAsync('UPDATE facturas SET vence = ? WHERE id = ?', vence, id);
}

export interface FilaFactura {
  id: number;
  proyecto_id: number;
  ncf: string;
  total_cts: number;
  pagado_cts: number;
  pagada: number;
  anulada: number;
  vence: string | null;
  creado_en: string;
  cliente: string;
  proyecto: string;
}

/** Todas las facturas, la más reciente primero. Solo las que se pueden abrir (con su proyecto y cliente). */
export function listarFacturas(db: SQLiteDatabase) {
  return db.getAllAsync<FilaFactura>(
    `SELECT f.id, f.proyecto_id, f.ncf, f.total_cts, f.pagada, f.anulada, f.vence, f.creado_en,
            c.nombre AS cliente, p.nombre AS proyecto,
            COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0) AS pagado_cts
     FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id
     ORDER BY f.id DESC`
  );
}

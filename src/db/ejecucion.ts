import type { SQLiteDatabase } from 'expo-sqlite';

import { contarCambios } from '@/ejecucion';
import { totales } from '@/dinero';
import type { TipoItem } from './catalogo';
import { listarLineas, obtenerOpciones, type Linea } from './cotizacion';

export interface LineaEjecucion {
  id: number;
  proyecto_id: number;
  descripcion: string;
  detalle: string | null;
  cantidad: number;
  cantidad_cotizada: number;
  precio_cts: number;
  descuento_pct: number;
  tipo: TipoItem;
  costo_cts: number;
  item_id: number | null;
}

export interface Comprobante {
  id: number;
  proyecto_id: number;
  foto_uri: string;
  nota: string | null;
  monto_cts: number | null;
  creado_en: string;
}

export type DatosLineaEjecucion = Pick<LineaEjecucion, 'descripcion' | 'cantidad' | 'precio_cts'> &
  Partial<Pick<LineaEjecucion, 'detalle' | 'tipo' | 'costo_cts' | 'item_id'>>;

export async function ejecucionIniciada(db: SQLiteDatabase, proyectoId: number) {
  const r = await db.getFirstAsync<{ f: string | null }>('SELECT ejecucion_iniciada_en AS f FROM proyectos WHERE id = ?', proyectoId);
  return !!r?.f;
}

export function listarEjecucion(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<LineaEjecucion>('SELECT * FROM ejecucion_items WHERE proyecto_id = ? ORDER BY id', proyectoId);
}

/**
 * Empieza la ejecución: copia la cotización como punto de partida (con las cantidades cotizadas guardadas para poder
 * comparar) y pasa el proyecto a "en ejecución". Devuelve false si no hay cotización o ya estaba iniciada.
 */
export async function iniciarEjecucion(db: SQLiteDatabase, proyectoId: number): Promise<boolean> {
  if ((await ejecucionIniciada(db, proyectoId)) || (await listarLineas(db, proyectoId)).length === 0) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO ejecucion_items (proyecto_id, descripcion, detalle, cantidad, cantidad_cotizada, precio_cts, descuento_pct, tipo, costo_cts, item_id)
       SELECT proyecto_id, descripcion, detalle, cantidad, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id
       FROM cotizacion_items WHERE proyecto_id = ? ORDER BY id`,
      proyectoId
    );
    await db.runAsync("UPDATE proyectos SET ejecucion_iniciada_en = datetime('now', 'localtime'), estado = 'en ejecución' WHERE id = ?", proyectoId);
  });
  return true;
}

export function cambiarCantidad(db: SQLiteDatabase, id: number, cantidad: number) {
  return db.runAsync('UPDATE ejecucion_items SET cantidad = ? WHERE id = ?', Math.max(0, Math.round(cantidad)), id);
}

/** Agrega un equipo o material. Si ya está en la lista (mismo artículo o mismo nombre), suma la cantidad. */
export async function agregarAEjecucion(db: SQLiteDatabase, proyectoId: number, d: DatosLineaEjecucion) {
  const existente =
    d.item_id != null
      ? await db.getFirstAsync<{ id: number }>('SELECT id FROM ejecucion_items WHERE proyecto_id = ? AND item_id = ? ORDER BY id LIMIT 1', proyectoId, d.item_id)
      : await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM ejecucion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1',
          proyectoId, d.descripcion
        );
  if (existente) {
    await db.runAsync('UPDATE ejecucion_items SET cantidad = cantidad + ? WHERE id = ?', d.cantidad, existente.id);
    return;
  }
  await db.runAsync(
    `INSERT INTO ejecucion_items (proyecto_id, descripcion, detalle, cantidad, cantidad_cotizada, precio_cts, tipo, costo_cts, item_id)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    proyectoId, d.descripcion, d.detalle ?? null, d.cantidad, d.precio_cts, d.tipo ?? 'equipo', d.costo_cts ?? 0, d.item_id ?? null
  );
}

/** Quita la línea: una agregada en la ejecución se borra; una cotizada queda en cero ("Quitado") y se puede restaurar. */
export async function quitarLinea(db: SQLiteDatabase, id: number) {
  const l = await db.getFirstAsync<{ cantidad_cotizada: number }>('SELECT cantidad_cotizada FROM ejecucion_items WHERE id = ?', id);
  if (!l) return;
  if (l.cantidad_cotizada === 0) await db.runAsync('DELETE FROM ejecucion_items WHERE id = ?', id);
  else await db.runAsync('UPDATE ejecucion_items SET cantidad = 0 WHERE id = ?', id);
}

export function restaurarLinea(db: SQLiteDatabase, id: number) {
  return db.runAsync('UPDATE ejecucion_items SET cantidad = cantidad_cotizada WHERE id = ?', id);
}

/** Deshace la ejecución: se borran sus cambios y el proyecto vuelve a "cotizado". Los comprobantes se conservan. */
export async function descartarEjecucion(db: SQLiteDatabase, proyectoId: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM ejecucion_items WHERE proyecto_id = ?', proyectoId);
    await db.runAsync("UPDATE proyectos SET ejecucion_iniciada_en = NULL, estado = CASE WHEN estado = 'en ejecución' THEN 'cotizado' ELSE estado END WHERE id = ?", proyectoId);
  });
}

// ---------- comprobantes: capturas de facturas de materiales y fotos de lo que se agrega o se quita ----------

export function listarComprobantes(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Comprobante>('SELECT * FROM comprobantes WHERE proyecto_id = ? ORDER BY id DESC', proyectoId);
}

export function agregarComprobante(db: SQLiteDatabase, proyectoId: number, fotoUri: string, nota: string | null, montoCts: number | null) {
  return db.runAsync('INSERT INTO comprobantes (proyecto_id, foto_uri, nota, monto_cts) VALUES (?, ?, ?, ?)', proyectoId, fotoUri, nota, montoCts);
}

export function eliminarComprobante(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM comprobantes WHERE id = ?', id);
}

// ---------- resumen y facturación ----------

export interface ResumenEjecucion {
  cotizado_cts: number;
  real_cts: number;
  cambios: number;
  gastos_cts: number;
  comprobantes: number;
}

/** Lo cotizado frente a lo real, los cambios y lo gastado en materiales. null si la ejecución no se ha iniciado. */
export async function resumenEjecucion(db: SQLiteDatabase, proyectoId: number): Promise<ResumenEjecucion | null> {
  if (!(await ejecucionIniciada(db, proyectoId))) return null;
  const items = await listarEjecucion(db, proyectoId);
  const op = await obtenerOpciones(db, proyectoId);
  const g = await db.getFirstAsync<{ n: number; total: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(monto_cts), 0) AS total FROM comprobantes WHERE proyecto_id = ?', proyectoId);
  return {
    cotizado_cts: totales(items.map((i) => ({ ...i, cantidad: i.cantidad_cotizada })), op.impuesto_pct, op.con_itbis).total,
    real_cts: totales(items, op.impuesto_pct, op.con_itbis).total,
    cambios: contarCambios(items),
    gastos_cts: g?.total ?? 0,
    comprobantes: g?.n ?? 0,
  };
}

/** Las líneas que se facturan: las de la ejecución si ya se inició (con sus cantidades reales); si no, las de la cotización. */
export async function lineasParaFacturar(db: SQLiteDatabase, proyectoId: number): Promise<{ lineas: Linea[]; deEjecucion: boolean }> {
  if (!(await ejecucionIniciada(db, proyectoId))) return { lineas: await listarLineas(db, proyectoId), deEjecucion: false };
  const lineas = (await listarEjecucion(db, proyectoId))
    .filter((l) => l.cantidad > 0)
    .map<Linea>((l) => ({ ...l, partida_id: null }));
  return { lineas, deEjecucion: true };
}

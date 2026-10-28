import type { SQLiteDatabase } from 'expo-sqlite';

import { precioParaProyecto } from '../dinero';
import { listarCatalogo, type TipoItem } from './catalogo';
import { crearLinea, listarLineas, obtenerOpciones } from './cotizacion';

export interface Kit {
  id: number;
  nombre: string;
  lineas: number;
}

export function listarKits(db: SQLiteDatabase) {
  return db.getAllAsync<Kit>(
    'SELECT k.id, k.nombre, (SELECT COUNT(*) FROM kit_items WHERE kit_id = k.id) AS lineas FROM kits k ORDER BY k.nombre COLLATE NOCASE'
  );
}

/** Guarda las líneas de esta cotización como un kit reutilizable. Devuelve false si no hay líneas o el nombre está vacío. */
export async function guardarKit(db: SQLiteDatabase, proyectoId: number, nombre: string): Promise<boolean> {
  const lineas = await listarLineas(db, proyectoId);
  if (!nombre.trim() || lineas.length === 0) return false;
  await db.withTransactionAsync(async () => {
    const k = await db.runAsync('INSERT INTO kits (nombre) VALUES (?)', nombre.trim());
    for (const l of lineas) {
      await db.runAsync(
        'INSERT INTO kit_items (kit_id, descripcion, detalle, cantidad, precio_cts, tipo, costo_cts, item_id, trabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        k.lastInsertRowId, l.descripcion, l.detalle, l.cantidad, l.precio_cts, l.tipo, l.costo_cts, l.item_id, l.trabajo
      );
    }
  });
  return true;
}

/**
 * Agrega el kit a la cotización. Las líneas que vienen del inventario se precian con el nivel y el ITBIS de este proyecto;
 * las escritas a mano conservan su precio. Una línea que ya estaba suma su cantidad.
 */
export async function aplicarKit(db: SQLiteDatabase, kitId: number, proyectoId: number) {
  const op = await obtenerOpciones(db, proyectoId);
  const inventario = new Map((await listarCatalogo(db)).map((p) => [p.id, p]));
  const items = await db.getAllAsync<{ descripcion: string; detalle: string | null; cantidad: number; precio_cts: number; tipo: TipoItem; costo_cts: number; item_id: number | null; trabajo: string | null }>(
    'SELECT descripcion, detalle, cantidad, precio_cts, tipo, costo_cts, item_id, trabajo FROM kit_items WHERE kit_id = ? ORDER BY id',
    kitId
  );
  await db.withTransactionAsync(async () => {
    for (const i of items) {
      const p = i.item_id === null ? undefined : inventario.get(i.item_id);
      await crearLinea(db, proyectoId, { ...i, precio_cts: p ? precioParaProyecto(p, op.nivel, op.con_itbis, op.impuesto_pct) : i.precio_cts });
    }
  });
  return items.length;
}

export function eliminarKit(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM kits WHERE id = ?', id);
}

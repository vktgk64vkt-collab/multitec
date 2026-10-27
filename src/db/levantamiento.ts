import type { SQLiteDatabase } from 'expo-sqlite';

import type { Producto } from './catalogo';

export interface Partida {
  id: number;
  proyecto_id: number;
  area: string;
  equipo: string;
  cantidad: number;
  notas: string | null;
  foto_uri: string | null;
  item_id: number | null;
}

export type DatosPartida = Omit<Partida, 'id' | 'proyecto_id' | 'item_id'>;

export function listarPartidas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Partida>('SELECT * FROM levantamiento WHERE proyecto_id = ? ORDER BY id DESC', proyectoId);
}

/**
 * Crea la partida. Si viene del inventario, crea también su línea de cotización con el precio
 * del inventario (enlazada por partida_id), así la cotización avanza mientras se hace el levantamiento.
 */
export function crearPartida(db: SQLiteDatabase, proyectoId: number, d: DatosPartida, item?: Producto, precioCts = item?.precio_cts ?? 0) {
  return db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      'INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, notas, foto_uri, item_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      proyectoId, d.area, d.equipo, d.cantidad, d.notas, d.foto_uri, item?.id ?? null
    );
    if (!item) return;
    await db.runAsync(
      `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, tipo, costo_cts, item_id, partida_id, detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      proyectoId, `${d.equipo} (${d.area})`, d.cantidad, precioCts, item.tipo, item.costo_cts, item.id, r.lastInsertRowId, item.descripcion
    );
  });
}

export function eliminarPartida(db: SQLiteDatabase, id: number) {
  return db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cotizacion_items WHERE partida_id = ?', id);
    await db.runAsync('DELETE FROM levantamiento WHERE id = ?', id);
  });
}

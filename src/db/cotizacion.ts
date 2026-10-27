import type { SQLiteDatabase } from 'expo-sqlite';

export interface Linea {
  id: number;
  proyecto_id: number;
  descripcion: string;
  cantidad: number;
  precio_cts: number;
}

export function listarLineas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Linea>('SELECT * FROM cotizacion_items WHERE proyecto_id = ? ORDER BY id', proyectoId);
}

export function importarDelLevantamiento(db: SQLiteDatabase, proyectoId: number) {
  return db.runAsync(
    `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad)
     SELECT proyecto_id, equipo || ' (' || area || ')', cantidad FROM levantamiento
     WHERE proyecto_id = ? ORDER BY id`,
    proyectoId
  );
}

export function crearLinea(db: SQLiteDatabase, proyectoId: number, descripcion: string, cantidad: number, precioCts: number) {
  return db.runAsync(
    'INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts) VALUES (?, ?, ?, ?)',
    proyectoId, descripcion, cantidad, precioCts
  );
}

export function actualizarPrecio(db: SQLiteDatabase, id: number, precioCts: number) {
  return db.runAsync('UPDATE cotizacion_items SET precio_cts = ? WHERE id = ?', precioCts, id);
}

export function eliminarLinea(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM cotizacion_items WHERE id = ?', id);
}

export async function obtenerImpuesto(db: SQLiteDatabase, proyectoId: number) {
  const r = await db.getFirstAsync<{ impuesto_pct: number }>('SELECT impuesto_pct FROM proyectos WHERE id = ?', proyectoId);
  return r?.impuesto_pct ?? 0;
}

export function guardarImpuesto(db: SQLiteDatabase, proyectoId: number, pct: number) {
  return db.runAsync('UPDATE proyectos SET impuesto_pct = ? WHERE id = ?', pct, proyectoId);
}

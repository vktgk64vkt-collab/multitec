import type { SQLiteDatabase } from 'expo-sqlite';

export interface Entrada {
  id: number;
  proyecto_id: number;
  texto: string;
  creado_en: string;
}

export function listarEntradas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Entrada>('SELECT * FROM bitacora WHERE proyecto_id = ? ORDER BY id DESC', proyectoId);
}

export function crearEntrada(db: SQLiteDatabase, proyectoId: number, texto: string) {
  return db.runAsync('INSERT INTO bitacora (proyecto_id, texto) VALUES (?, ?)', proyectoId, texto);
}

export function eliminarEntrada(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM bitacora WHERE id = ?', id);
}

import type { SQLiteDatabase } from 'expo-sqlite';

export interface Partida {
  id: number;
  proyecto_id: number;
  area: string;
  equipo: string;
  cantidad: number;
  notas: string | null;
  foto_uri: string | null;
}

export type DatosPartida = Omit<Partida, 'id' | 'proyecto_id'>;

export function listarPartidas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Partida>('SELECT * FROM levantamiento WHERE proyecto_id = ? ORDER BY id DESC', proyectoId);
}

export function crearPartida(db: SQLiteDatabase, proyectoId: number, d: DatosPartida) {
  return db.runAsync(
    'INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, notas, foto_uri) VALUES (?, ?, ?, ?, ?, ?)',
    proyectoId, d.area, d.equipo, d.cantidad, d.notas, d.foto_uri
  );
}

export function eliminarPartida(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM levantamiento WHERE id = ?', id);
}

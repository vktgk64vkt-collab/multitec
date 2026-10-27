import type { SQLiteDatabase } from 'expo-sqlite';

export interface Negocio {
  nombre: string | null;
  rnc: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  logo_uri: string | null;
}

export function obtenerNegocio(db: SQLiteDatabase) {
  return db.getFirstAsync<Negocio>('SELECT nombre, rnc, telefono, correo, direccion, logo_uri FROM negocio WHERE id = 1');
}

export function guardarNegocio(db: SQLiteDatabase, n: Negocio) {
  return db.runAsync(
    'INSERT OR REPLACE INTO negocio (id, nombre, rnc, telefono, correo, direccion, logo_uri) VALUES (1, ?, ?, ?, ?, ?, ?)',
    n.nombre, n.rnc, n.telefono, n.correo, n.direccion, n.logo_uri
  );
}

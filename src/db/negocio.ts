import type { SQLiteDatabase } from 'expo-sqlite';

/** La empresa del usuario: sale en el encabezado de todos sus documentos. Cada instalación tiene la suya. */
export interface Negocio {
  nombre: string | null;
  rnc: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  logo_uri: string | null;
  lema: string | null; // frase del pie de los documentos
  color: string | null; // color de marca (#rrggbb)
}

export function obtenerNegocio(db: SQLiteDatabase) {
  return db.getFirstAsync<Negocio>('SELECT nombre, rnc, telefono, correo, direccion, logo_uri, lema, color FROM negocio WHERE id = 1');
}

export function guardarNegocio(db: SQLiteDatabase, n: Negocio) {
  return db.runAsync(
    'INSERT OR REPLACE INTO negocio (id, nombre, rnc, telefono, correo, direccion, logo_uri, lema, color) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)',
    n.nombre, n.rnc, n.telefono, n.correo, n.direccion, n.logo_uri, n.lema, n.color
  );
}

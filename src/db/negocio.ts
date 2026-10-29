import type { SQLiteDatabase } from 'expo-sqlite';

import { MARGENES_BASE } from '../dinero';

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
    `INSERT INTO negocio (id, nombre, rnc, telefono, correo, direccion, logo_uri, lema, color) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, rnc = excluded.rnc, telefono = excluded.telefono, correo = excluded.correo,
       direccion = excluded.direccion, logo_uri = excluded.logo_uri, lema = excluded.lema, color = excluded.color`,
    n.nombre, n.rnc, n.telefono, n.correo, n.direccion, n.logo_uri, n.lema, n.color
  );
}

/** Los tres márgenes de ganancia (%) con que nacen los artículos nuevos: precio 1, 2 y 3. */
export type Margenes = [number, number, number];

export async function obtenerMargenes(db: SQLiteDatabase): Promise<Margenes> {
  const r = await db.getFirstAsync<{ a: number; b: number; c: number }>('SELECT margen1_pct AS a, margen2_pct AS b, margen3_pct AS c FROM negocio WHERE id = 1');
  return r ? [r.a, r.b, r.c] : [...MARGENES_BASE];
}

export function guardarMargenes(db: SQLiteDatabase, m: Margenes) {
  return db.runAsync(
    `INSERT INTO negocio (id, margen1_pct, margen2_pct, margen3_pct) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET margen1_pct = excluded.margen1_pct, margen2_pct = excluded.margen2_pct, margen3_pct = excluded.margen3_pct`,
    m[0], m[1], m[2]
  );
}

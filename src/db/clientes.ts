import type { SQLiteDatabase } from 'expo-sqlite';

export interface Cliente {
  id: number;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  id_fiscal: string | null;
  notas: string | null;
  ubicacion_url: string | null; // enlace de Google Maps al punto exacto
  creado_en: string;
}

export type DatosCliente = Omit<Cliente, 'id' | 'creado_en'>;

export function listarClientes(db: SQLiteDatabase, busqueda = '') {
  const texto = `%${busqueda.trim()}%`;
  return db.getAllAsync<Cliente>(
    `SELECT * FROM clientes
     WHERE nombre LIKE ?1 OR empresa LIKE ?1 OR telefono LIKE ?1
     ORDER BY nombre COLLATE NOCASE`,
    texto
  );
}

export function obtenerCliente(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Cliente>('SELECT * FROM clientes WHERE id = ?', id);
}

export async function crearCliente(db: SQLiteDatabase, d: DatosCliente) {
  const r = await db.runAsync(
    `INSERT INTO clientes (nombre, empresa, telefono, correo, direccion, id_fiscal, notas, ubicacion_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    d.nombre, d.empresa, d.telefono, d.correo, d.direccion, d.id_fiscal, d.notas, d.ubicacion_url
  );
  return r.lastInsertRowId;
}

/** El cliente con ese nombre (sin importar mayúsculas ni espacios de más) o uno nuevo con solo el nombre. Devuelve su id. */
export async function buscarOCrearCliente(db: SQLiteDatabase, nombre: string): Promise<number> {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  const r = await db.getFirstAsync<{ id: number }>('SELECT id FROM clientes WHERE lower(trim(nombre)) = lower(?) ORDER BY id LIMIT 1', limpio);
  if (r) return r.id;
  return crearCliente(db, { nombre: limpio, empresa: null, telefono: null, correo: null, direccion: null, id_fiscal: null, notas: null, ubicacion_url: null });
}

export function actualizarCliente(db: SQLiteDatabase, id: number, d: DatosCliente) {
  return db.runAsync(
    `UPDATE clientes SET nombre = ?, empresa = ?, telefono = ?, correo = ?,
       direccion = ?, id_fiscal = ?, notas = ?, ubicacion_url = ? WHERE id = ?`,
    d.nombre, d.empresa, d.telefono, d.correo, d.direccion, d.id_fiscal, d.notas, d.ubicacion_url, id
  );
}

/** Devuelve false si el cliente tiene proyectos: borrarlo arrastraría sus facturas y cotizaciones. */
export async function eliminarCliente(db: SQLiteDatabase, id: number): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM proyectos WHERE cliente_id = ?', id);
  if ((r?.n ?? 0) > 0) return false;
  await db.runAsync('DELETE FROM clientes WHERE id = ?', id);
  return true;
}

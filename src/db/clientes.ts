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
    `INSERT INTO clientes (nombre, empresa, telefono, correo, direccion, id_fiscal, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    d.nombre, d.empresa, d.telefono, d.correo, d.direccion, d.id_fiscal, d.notas
  );
  return r.lastInsertRowId;
}

export function actualizarCliente(db: SQLiteDatabase, id: number, d: DatosCliente) {
  return db.runAsync(
    `UPDATE clientes SET nombre = ?, empresa = ?, telefono = ?, correo = ?,
       direccion = ?, id_fiscal = ?, notas = ? WHERE id = ?`,
    d.nombre, d.empresa, d.telefono, d.correo, d.direccion, d.id_fiscal, d.notas, id
  );
}

export function eliminarCliente(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM clientes WHERE id = ?', id);
}

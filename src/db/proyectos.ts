import type { SQLiteDatabase } from 'expo-sqlite';

export const TIPOS = ['CCTV', 'Alarma', 'Control de acceso', 'Cableado', 'Otro'] as const;
export const ESTADOS = ['levantamiento', 'cotizado', 'en ejecución', 'facturado', 'cerrado'] as const;

export interface Proyecto {
  id: number;
  cliente_id: number;
  cliente: string;
  nombre: string;
  tipo: string;
  estado: string;
  creado_en: string;
}

const SELECT = `SELECT p.*, c.nombre AS cliente FROM proyectos p JOIN clientes c ON c.id = p.cliente_id`;

export function listarProyectos(db: SQLiteDatabase) {
  return db.getAllAsync<Proyecto>(`${SELECT} ORDER BY p.id DESC`);
}

export function obtenerProyecto(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Proyecto>(`${SELECT} WHERE p.id = ?`, id);
}

export async function crearProyecto(db: SQLiteDatabase, clienteId: number, nombre: string, tipo: string) {
  const r = await db.runAsync(
    'INSERT INTO proyectos (cliente_id, nombre, tipo, impuesto_pct) VALUES (?, ?, ?, 18)', // ITBIS RD
    clienteId, nombre, tipo
  );
  return r.lastInsertRowId;
}

export function cambiarEstado(db: SQLiteDatabase, id: number, estado: string) {
  return db.runAsync('UPDATE proyectos SET estado = ? WHERE id = ?', estado, id);
}

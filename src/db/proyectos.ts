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
    'INSERT INTO proyectos (cliente_id, nombre, tipo, impuesto_pct, precios_con_itbis) VALUES (?, ?, ?, 18, 1)', // ITBIS RD; precios con ITBIS incluido
    clienteId, nombre, tipo
  );
  return r.lastInsertRowId;
}

export function cambiarEstado(db: SQLiteDatabase, id: number, estado: string) {
  return db.runAsync('UPDATE proyectos SET estado = ? WHERE id = ?', estado, id);
}

/** Copia el proyecto con su cotización (sin factura, bitácora ni fotos). Devuelve el id nuevo. */
export async function duplicarProyecto(db: SQLiteDatabase, id: number) {
  let nuevo = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      `INSERT INTO proyectos (cliente_id, nombre, tipo, impuesto_pct, condiciones, precios_con_itbis, nivel_precio)
       SELECT cliente_id, nombre || ' (copia)', tipo, impuesto_pct, condiciones, precios_con_itbis, nivel_precio FROM proyectos WHERE id = ?`,
      id
    );
    nuevo = r.lastInsertRowId;
    await db.runAsync(
      `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id)
       SELECT ?, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id FROM cotizacion_items
       WHERE proyecto_id = ? ORDER BY id`,
      nuevo, id
    );
  });
  return nuevo;
}

export const CONDICIONES_BASE =
  'Validez de la oferta: 15 días. Garantía: 1 año en equipos y 90 días en instalación. Pago: 50 % de anticipo y el resto contra entrega.';

export async function obtenerCondiciones(db: SQLiteDatabase, id: number) {
  const r = await db.getFirstAsync<{ condiciones: string | null }>('SELECT condiciones FROM proyectos WHERE id = ?', id);
  return r?.condiciones ?? CONDICIONES_BASE;
}

export function guardarCondiciones(db: SQLiteDatabase, id: number, texto: string) {
  return db.runAsync('UPDATE proyectos SET condiciones = ? WHERE id = ?', texto.trim() || null, id);
}

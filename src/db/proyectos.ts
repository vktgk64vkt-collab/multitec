import type { SQLiteDatabase } from 'expo-sqlite';

export const TIPOS = ['CCTV', 'Alarma', 'Control de acceso', 'Cableado', 'Otro'] as const;
export const ESTADOS = ['levantamiento', 'cotizado', 'en ejecución', 'facturado', 'cerrado'] as const;

// El valor guardado es la posición: 0 baja, 1 media, 2 alta.
export const PRIORIDADES = ['Baja', 'Media', 'Alta'] as const;
export const PRIORIDAD_MEDIA = 1;

export type FiltroProyectos = 'activos' | 'cerrados' | 'todos';

export interface Proyecto {
  id: number;
  cliente_id: number;
  cliente: string;
  nombre: string;
  tipo: string;
  estado: string;
  prioridad: number;
  creado_en: string;
}

const SELECT = `SELECT p.*, c.nombre AS cliente FROM proyectos p JOIN clientes c ON c.id = p.cliente_id`;

/**
 * Proyectos del más urgente al menos: primero la prioridad (alta, media, baja) y, dentro de cada una, el más reciente.
 * "Activos" son los que no están cerrados; los cerrados siempre van al final.
 */
export function listarProyectos(db: SQLiteDatabase, filtro: FiltroProyectos = 'todos') {
  const donde = filtro === 'activos' ? "WHERE p.estado <> 'cerrado'" : filtro === 'cerrados' ? "WHERE p.estado = 'cerrado'" : '';
  return db.getAllAsync<Proyecto>(
    `${SELECT} ${donde} ORDER BY (p.estado = 'cerrado'), p.prioridad DESC, p.creado_en DESC, p.id DESC`
  );
}

export function obtenerProyecto(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Proyecto>(`${SELECT} WHERE p.id = ?`, id);
}

export async function crearProyecto(db: SQLiteDatabase, clienteId: number, nombre: string, tipo: string, prioridad = PRIORIDAD_MEDIA) {
  const r = await db.runAsync(
    'INSERT INTO proyectos (cliente_id, nombre, tipo, prioridad, impuesto_pct, precios_con_itbis) VALUES (?, ?, ?, ?, 18, 1)', // ITBIS RD; precios con ITBIS incluido
    clienteId, nombre, tipo, prioridad
  );
  return r.lastInsertRowId;
}

export function cambiarPrioridad(db: SQLiteDatabase, id: number, prioridad: number) {
  return db.runAsync('UPDATE proyectos SET prioridad = ? WHERE id = ?', prioridad, id);
}

export function cambiarEstado(db: SQLiteDatabase, id: number, estado: string) {
  return db.runAsync('UPDATE proyectos SET estado = ? WHERE id = ?', estado, id);
}

/** Copia el proyecto con su cotización (sin factura, bitácora ni fotos). Devuelve el id nuevo. */
export async function duplicarProyecto(db: SQLiteDatabase, id: number) {
  let nuevo = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      `INSERT INTO proyectos (cliente_id, nombre, tipo, prioridad, impuesto_pct, condiciones, precios_con_itbis, nivel_precio, propuesta_intro)
       SELECT cliente_id, nombre || ' (copia)', tipo, prioridad, impuesto_pct, condiciones, precios_con_itbis, nivel_precio, propuesta_intro FROM proyectos WHERE id = ?`,
      id
    );
    nuevo = r.lastInsertRowId;
    await db.runAsync(
      `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id, detalle)
       SELECT ?, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id, detalle FROM cotizacion_items
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

export async function obtenerPropuestaIntro(db: SQLiteDatabase, id: number) {
  const r = await db.getFirstAsync<{ propuesta_intro: string | null }>('SELECT propuesta_intro FROM proyectos WHERE id = ?', id);
  return r?.propuesta_intro ?? '';
}

export function guardarPropuestaIntro(db: SQLiteDatabase, id: number, texto: string) {
  return db.runAsync('UPDATE proyectos SET propuesta_intro = ? WHERE id = ?', texto.trim() || null, id);
}

/** Borra el proyecto con su levantamiento, cotización y bitácora. Devuelve false si tiene factura (hay que anularla y conservarla). */
export async function eliminarProyecto(db: SQLiteDatabase, id: number): Promise<boolean> {
  const f = await db.getFirstAsync('SELECT 1 FROM facturas WHERE proyecto_id = ?', id);
  if (f) return false;
  await db.runAsync('DELETE FROM proyectos WHERE id = ?', id);
  return true;
}

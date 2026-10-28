import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaEn, formatearFecha } from '../dinero';
import { listarLineas } from './cotizacion';
import { copiarCotizacion } from './ejecucion';

export const TIPOS = ['CCTV', 'Alarma', 'Control de acceso', 'Cableado', 'Otro'] as const;
export const ESTADOS = ['levantamiento', 'cotizado', 'en ejecución', 'facturado', 'cerrado'] as const;

// El valor guardado es la posición: 0 baja, 1 media, 2 alta.
export const PRIORIDADES = ['Baja', 'Media', 'Alta'] as const;
export const PRIORIDAD_MEDIA = 1;

export type FiltroProyectos = 'activos' | 'cerrados' | 'todos';

/** Una cotización pasa a proyecto cuando el cliente la aprueba. */
export type Etapa = 'cotizacion' | 'proyecto';
export const COT_ESTADOS = ['borrador', 'enviada', 'rechazada', 'aprobada'] as const;
export type CotEstado = (typeof COT_ESTADOS)[number];

export interface Proyecto {
  id: number;
  cliente_id: number;
  cliente: string;
  nombre: string;
  tipo: string;
  estado: string;
  prioridad: number;
  creado_en: string;
  aprobado_en: string | null;
  cot_estado: CotEstado;
  enviada_en: string | null;
  ejecucion_iniciada_en: string | null;
  impuesto_pct: number;
  precios_con_itbis: number;
  descuento_pct: number;
}

const SELECT = `SELECT p.*, c.nombre AS cliente FROM proyectos p JOIN clientes c ON c.id = p.cliente_id`;

/**
 * Proyectos del más urgente al menos: primero la prioridad (alta, media, baja) y, dentro de cada una, el más reciente.
 * "Activos" son los que no están cerrados; los cerrados siempre van al final.
 * Por defecto solo los proyectos (aprobados); con `etapa: 'cotizacion'` las cotizaciones por responder, donde "cerrados" son las rechazadas.
 */
export function listarProyectos(db: SQLiteDatabase, filtro: FiltroProyectos = 'todos', etapa: Etapa = 'proyecto') {
  const condiciones = [etapa === 'proyecto' ? 'p.aprobado_en IS NOT NULL' : 'p.aprobado_en IS NULL'];
  const cerrado = etapa === 'proyecto' ? "p.estado = 'cerrado'" : "p.cot_estado = 'rechazada'";
  if (filtro === 'activos') condiciones.push(`NOT (${cerrado})`);
  else if (filtro === 'cerrados') condiciones.push(cerrado);
  return db.getAllAsync<Proyecto>(
    `${SELECT} WHERE ${condiciones.join(' AND ')} ORDER BY (p.estado = 'cerrado'), p.prioridad DESC, p.creado_en DESC, p.id DESC`
  );
}

export function obtenerProyecto(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Proyecto>(`${SELECT} WHERE p.id = ?`, id);
}

/**
 * Empieza una cotización. Hereda del último proyecto el nivel de precio, si los precios llevan ITBIS y las condiciones, para no
 * repetir los mismos ajustes cada vez. El impuesto siempre arranca en 18 %: un cliente exento no debe contagiar al siguiente.
 */
export async function crearProyecto(db: SQLiteDatabase, clienteId: number, nombre: string, tipo: string, prioridad = PRIORIDAD_MEDIA) {
  const u = await db.getFirstAsync<{ precios_con_itbis: number; nivel_precio: number; condiciones: string | null }>(
    'SELECT precios_con_itbis, nivel_precio, condiciones FROM proyectos ORDER BY id DESC LIMIT 1'
  );
  const r = await db.runAsync(
    'INSERT INTO proyectos (cliente_id, nombre, tipo, prioridad, impuesto_pct, precios_con_itbis, nivel_precio, condiciones) VALUES (?, ?, ?, ?, 18, ?, ?, ?)',
    clienteId, nombre, tipo, prioridad, u?.precios_con_itbis ?? 1, u?.nivel_precio ?? 1, u?.condiciones ?? null
  );
  return r.lastInsertRowId;
}

/** Nombre que se pone solo: "CCTV · Juan Pérez · 27 oct 2026". */
export function nombreAutomatico(tipo: string, cliente: string, hoy = new Date()) {
  return `${tipo} · ${cliente} · ${formatearFecha(fechaEn(0, hoy))}`;
}

/** Vuelve a abrir un proyecto cerrado en el estado que le corresponde por lo que ya tiene hecho. */
export function reabrirProyecto(db: SQLiteDatabase, id: number) {
  return db.runAsync(
    `UPDATE proyectos SET estado = CASE
       WHEN EXISTS (SELECT 1 FROM facturas f WHERE f.proyecto_id = proyectos.id AND f.anulada = 0) THEN 'facturado'
       WHEN ejecucion_iniciada_en IS NOT NULL THEN 'en ejecución'
       ELSE 'cotizado' END
     WHERE id = ?`,
    id
  );
}

/** Archivos de foto del proyecto (partidas y comprobantes), para borrarlos del teléfono cuando se borra el proyecto. */
export async function fotosDelProyecto(db: SQLiteDatabase, id: number): Promise<string[]> {
  const filas = await db.getAllAsync<{ foto: string }>(
    `SELECT foto_uri AS foto FROM levantamiento WHERE proyecto_id = ?1 AND foto_uri IS NOT NULL
     UNION SELECT foto_uri FROM comprobantes WHERE proyecto_id = ?1`,
    id
  );
  return filas.map((f) => f.foto);
}

export function cambiarPrioridad(db: SQLiteDatabase, id: number, prioridad: number) {
  return db.runAsync('UPDATE proyectos SET prioridad = ? WHERE id = ?', prioridad, id);
}

export function cambiarEstado(db: SQLiteDatabase, id: number, estado: string) {
  return db.runAsync('UPDATE proyectos SET estado = ? WHERE id = ?', estado, id);
}

/** Estado de una cotización que aún no se aprueba. */
export function cambiarEstadoCotizacion(db: SQLiteDatabase, id: number, estado: Exclude<CotEstado, 'aprobada'>) {
  return db.runAsync("UPDATE proyectos SET cot_estado = ?1, enviada_en = CASE WHEN ?1 = 'enviada' THEN datetime('now', 'localtime') ELSE enviada_en END WHERE id = ?2 AND aprobado_en IS NULL", estado, id);
}

/** Al compartir la cotización pasa de borrador a enviada. Una ya enviada, rechazada o aprobada no cambia. */
export function marcarEnviada(db: SQLiteDatabase, id: number) {
  return db.runAsync("UPDATE proyectos SET cot_estado = 'enviada', enviada_en = datetime('now', 'localtime') WHERE id = ? AND aprobado_en IS NULL AND cot_estado = 'borrador'", id);
}

/**
 * El cliente aprobó: la cotización pasa a proyecto y arranca la ejecución con las líneas cotizadas.
 * Devuelve false si no hay líneas que aprobar o ya era proyecto.
 */
export async function aprobarCotizacion(db: SQLiteDatabase, id: number): Promise<boolean> {
  const p = await db.getFirstAsync<{ aprobado_en: string | null }>('SELECT aprobado_en FROM proyectos WHERE id = ?', id);
  if (!p || p.aprobado_en || (await listarLineas(db, id)).length === 0) return false;
  // aprobar y abrir la ejecución, juntos o ninguno: sin la ejecución la factura saldría de la cotización sin que lo notes
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE proyectos SET aprobado_en = datetime('now', 'localtime'), cot_estado = 'aprobada', estado = 'cotizado' WHERE id = ?", id);
    await copiarCotizacion(db, id);
  });
  return true;
}

/** Copia el proyecto con su cotización (sin factura, bitácora ni fotos). Devuelve el id nuevo. */
export async function duplicarProyecto(db: SQLiteDatabase, id: number) {
  let nuevo = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      `INSERT INTO proyectos (cliente_id, nombre, tipo, prioridad, impuesto_pct, condiciones, precios_con_itbis, nivel_precio, propuesta_intro, descuento_pct)
       SELECT cliente_id, nombre || ' (copia)', tipo, prioridad, impuesto_pct, condiciones, precios_con_itbis, nivel_precio, propuesta_intro, descuento_pct FROM proyectos WHERE id = ?`,
      id
    );
    nuevo = r.lastInsertRowId;
    await db.runAsync(
      `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id, detalle, trabajo)
       SELECT ?, descripcion, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id, detalle, trabajo FROM cotizacion_items
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

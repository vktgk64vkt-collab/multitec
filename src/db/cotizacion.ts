import type { SQLiteDatabase } from 'expo-sqlite';

import { precioParaProyecto } from '@/dinero';
import { listarCatalogo, type TipoItem } from './catalogo';

export interface Linea {
  id: number;
  proyecto_id: number;
  descripcion: string;
  cantidad: number;
  precio_cts: number;
  descuento_pct: number;
  tipo: TipoItem;
  costo_cts: number;
  item_id: number | null;
  partida_id: number | null;
  detalle: string | null; // descripción breve copiada del inventario
}

export type DatosLinea = Pick<Linea, 'descripcion' | 'cantidad' | 'precio_cts'> &
  Partial<Pick<Linea, 'tipo' | 'costo_cts' | 'item_id' | 'partida_id' | 'detalle'>>;

export function listarLineas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Linea>('SELECT * FROM cotizacion_items WHERE proyecto_id = ? ORDER BY id', proyectoId);
}

/** Partidas del levantamiento que aún no tienen línea en la cotización. */
export function contarPartidasPendientes(db: SQLiteDatabase, proyectoId: number) {
  return db
    .getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM levantamiento l
       WHERE l.proyecto_id = ? AND NOT EXISTS (SELECT 1 FROM cotizacion_items c WHERE c.partida_id = l.id)`,
      proyectoId
    )
    .then((r) => r?.n ?? 0);
}

export function importarDelLevantamiento(db: SQLiteDatabase, proyectoId: number) {
  return db.runAsync(
    `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, partida_id)
     SELECT proyecto_id, equipo || ' (' || area || ')', cantidad, id FROM levantamiento l
     WHERE proyecto_id = ? AND NOT EXISTS (SELECT 1 FROM cotizacion_items c WHERE c.partida_id = l.id)
     ORDER BY id`,
    proyectoId
  );
}

export function crearLinea(db: SQLiteDatabase, proyectoId: number, d: DatosLinea) {
  return db.runAsync(
    `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, tipo, costo_cts, item_id, partida_id, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    proyectoId, d.descripcion, d.cantidad, d.precio_cts, d.tipo ?? 'equipo', d.costo_cts ?? 0, d.item_id ?? null, d.partida_id ?? null, d.detalle ?? null
  );
}

export function actualizarPrecio(db: SQLiteDatabase, id: number, precioCts: number) {
  return db.runAsync('UPDATE cotizacion_items SET precio_cts = ? WHERE id = ?', precioCts, id);
}

export function actualizarDescuento(db: SQLiteDatabase, id: number, pct: number) {
  return db.runAsync('UPDATE cotizacion_items SET descuento_pct = ? WHERE id = ?', pct, id);
}

export function eliminarLinea(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM cotizacion_items WHERE id = ?', id);
}

export async function obtenerImpuesto(db: SQLiteDatabase, proyectoId: number) {
  return (await obtenerOpciones(db, proyectoId)).impuesto_pct;
}

export interface Opciones {
  impuesto_pct: number;
  con_itbis: boolean; // los precios de las líneas ya incluyen el impuesto
  nivel: number; // 1-3: cuál de los 3 precios del inventario se usa
}

export async function obtenerOpciones(db: SQLiteDatabase, proyectoId: number): Promise<Opciones> {
  const r = await db.getFirstAsync<{ impuesto_pct: number; precios_con_itbis: number; nivel_precio: number }>(
    'SELECT impuesto_pct, precios_con_itbis, nivel_precio FROM proyectos WHERE id = ?',
    proyectoId
  );
  return { impuesto_pct: r?.impuesto_pct ?? 0, con_itbis: r?.precios_con_itbis === 1, nivel: r?.nivel_precio ?? 1 };
}

/** Guarda nivel y modo de ITBIS y reprecia las líneas que vienen del inventario (las manuales no se tocan). */
export async function aplicarPrecios(db: SQLiteDatabase, proyectoId: number, nivel: number, conItbis: boolean) {
  const inventario = new Map((await listarCatalogo(db)).map((p) => [p.id, p]));
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE proyectos SET nivel_precio = ?, precios_con_itbis = ? WHERE id = ?', nivel, conItbis ? 1 : 0, proyectoId);
    const { impuesto_pct } = await obtenerOpciones(db, proyectoId);
    for (const l of await listarLineas(db, proyectoId)) {
      const p = l.item_id === null ? undefined : inventario.get(l.item_id);
      if (p) await db.runAsync('UPDATE cotizacion_items SET precio_cts = ? WHERE id = ?', precioParaProyecto(p, nivel, conItbis, impuesto_pct), l.id);
    }
  });
}

export function guardarImpuesto(db: SQLiteDatabase, proyectoId: number, pct: number) {
  return db.runAsync('UPDATE proyectos SET impuesto_pct = ? WHERE id = ?', pct, proyectoId);
}

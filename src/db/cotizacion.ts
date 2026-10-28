import type { SQLiteDatabase } from 'expo-sqlite';

import { precioParaProyecto } from '@/dinero';
import { trabajosDistintos } from '../trabajos';
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
  trabajo: string | null; // alarma, cámaras, portón...; null = General
}

export type DatosLinea = Pick<Linea, 'descripcion' | 'cantidad' | 'precio_cts'> &
  Partial<Pick<Linea, 'tipo' | 'costo_cts' | 'item_id' | 'partida_id' | 'detalle' | 'trabajo'>>;

export function listarLineas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Linea>('SELECT * FROM cotizacion_items WHERE proyecto_id = ? ORDER BY id', proyectoId);
}

/** Partidas del levantamiento que aún no tienen línea en la cotización. */
export function contarPartidasPendientes(db: SQLiteDatabase, proyectoId: number) {
  return db
    .getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM levantamiento WHERE proyecto_id = ? AND en_cotizacion = 0`,
      proyectoId
    )
    .then((r) => r?.n ?? 0);
}

/** Pasa a la cotización las partidas escritas a mano (sin inventario). Las que se repiten se suman en una sola línea. */
export function importarDelLevantamiento(db: SQLiteDatabase, proyectoId: number) {
  return db.withTransactionAsync(async () => {
    const pendientes = await db.getAllAsync<{ id: number; equipo: string; cantidad: number; trabajo: string | null }>(
      'SELECT id, equipo, cantidad, trabajo FROM levantamiento WHERE proyecto_id = ? AND en_cotizacion = 0 ORDER BY id',
      proyectoId
    );
    for (const p of pendientes) {
      await crearLinea(db, proyectoId, { descripcion: p.equipo, cantidad: p.cantidad, precio_cts: 0, trabajo: p.trabajo });
      await db.runAsync('UPDATE levantamiento SET en_cotizacion = 1 WHERE id = ?', p.id);
    }
  });
}

/**
 * Agrega a la cotización. Si el artículo ya está (mismo artículo del inventario, o mismo nombre en las líneas a mano),
 * suma la cantidad a esa línea en vez de crear otra: así no se repite el texto.
 */
export async function crearLinea(db: SQLiteDatabase, proyectoId: number, d: DatosLinea) {
  const existente =
    d.item_id != null
      ? await db.getFirstAsync<{ id: number; precio_cts: number }>(
          "SELECT id, precio_cts FROM cotizacion_items WHERE proyecto_id = ? AND item_id = ? AND IFNULL(trabajo, '') = ? ORDER BY id LIMIT 1",
          proyectoId, d.item_id, d.trabajo ?? ''
        )
      : await db.getFirstAsync<{ id: number; precio_cts: number }>(
          "SELECT id, precio_cts FROM cotizacion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) AND IFNULL(trabajo, '') = ? ORDER BY id LIMIT 1",
          proyectoId, d.descripcion, d.trabajo ?? ''
        );
  if (existente) {
    // si la línea a mano aún no tenía precio y ahora llega uno, se lo queda
    await db.runAsync(
      'UPDATE cotizacion_items SET cantidad = cantidad + ?, precio_cts = CASE WHEN precio_cts = 0 THEN ? ELSE precio_cts END WHERE id = ?',
      d.cantidad, d.precio_cts, existente.id
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, tipo, costo_cts, item_id, partida_id, detalle, trabajo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    proyectoId, d.descripcion, d.cantidad, d.precio_cts, d.tipo ?? 'equipo', d.costo_cts ?? 0, d.item_id ?? null, d.partida_id ?? null, d.detalle ?? null, d.trabajo ?? null
  );
}

export function actualizarPrecio(db: SQLiteDatabase, id: number, precioCts: number) {
  return db.runAsync('UPDATE cotizacion_items SET precio_cts = ? WHERE id = ?', precioCts, id);
}

/** Descuento global del documento (%), opcional: 0 = sin descuento. */
export function guardarDescuentoGlobal(db: SQLiteDatabase, proyectoId: number, pct: number) {
  return db.runAsync('UPDATE proyectos SET descuento_pct = ? WHERE id = ?', pct, proyectoId);
}

/** Pasa la línea a otro trabajo (null = General). Si en ese trabajo ya hay la misma línea, se suman. */
export async function moverLinea(db: SQLiteDatabase, id: number, trabajo: string | null) {
  const l = await db.getFirstAsync<Linea>('SELECT * FROM cotizacion_items WHERE id = ?', id);
  if (!l) return;
  const destino = trabajo?.trim() || null;
  const igual = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM cotizacion_items WHERE proyecto_id = ? AND id <> ? AND IFNULL(trabajo, '') = ? AND IFNULL(item_id, -1) = IFNULL(?, -1)
       AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1`,
    l.proyecto_id, id, destino ?? '', l.item_id, l.descripcion
  );
  await db.withTransactionAsync(async () => {
    if (igual) {
      await db.runAsync('UPDATE cotizacion_items SET cantidad = cantidad + ? WHERE id = ?', l.cantidad, igual.id);
      await db.runAsync('DELETE FROM cotizacion_items WHERE id = ?', id);
    } else {
      await db.runAsync('UPDATE cotizacion_items SET trabajo = ? WHERE id = ?', destino, id);
    }
  });
}

/** Los trabajos que ya tiene el proyecto (en la cotización o el levantamiento), para ofrecerlos como opciones. */
export async function listarTrabajos(db: SQLiteDatabase, proyectoId: number): Promise<string[]> {
  const filas = await db.getAllAsync<{ trabajo: string }>(
    `SELECT trabajo FROM cotizacion_items WHERE proyecto_id = ?1 AND trabajo IS NOT NULL
     UNION SELECT trabajo FROM levantamiento WHERE proyecto_id = ?1 AND trabajo IS NOT NULL
     UNION SELECT trabajo FROM ejecucion_items WHERE proyecto_id = ?1 AND trabajo IS NOT NULL`,
    proyectoId
  );
  return trabajosDistintos(filas.map((f) => f.trabajo));
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
  descuento_pct: number; // descuento global del documento
}

export async function obtenerOpciones(db: SQLiteDatabase, proyectoId: number): Promise<Opciones> {
  const r = await db.getFirstAsync<{ impuesto_pct: number; precios_con_itbis: number; nivel_precio: number; descuento_pct: number }>(
    'SELECT impuesto_pct, precios_con_itbis, nivel_precio, descuento_pct FROM proyectos WHERE id = ?',
    proyectoId
  );
  return { impuesto_pct: r?.impuesto_pct ?? 0, con_itbis: r?.precios_con_itbis === 1, nivel: r?.nivel_precio ?? 1, descuento_pct: r?.descuento_pct ?? 0 };
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

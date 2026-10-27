import type { SQLiteDatabase } from 'expo-sqlite';

import type { Producto } from './catalogo';
import { crearLinea } from './cotizacion';

export interface Partida {
  id: number;
  proyecto_id: number;
  area: string;
  equipo: string;
  cantidad: number;
  notas: string | null;
  foto_uri: string | null;
  item_id: number | null;
  en_cotizacion: number; // 1 = su cantidad ya está sumada en la cotización
}

export type DatosPartida = Omit<Partida, 'id' | 'proyecto_id' | 'item_id' | 'en_cotizacion'>;

export function listarPartidas(db: SQLiteDatabase, proyectoId: number) {
  return db.getAllAsync<Partida>('SELECT * FROM levantamiento WHERE proyecto_id = ? ORDER BY id DESC', proyectoId);
}

/**
 * Crea la partida. Si viene del inventario:
 * - si ya hay una partida del mismo artículo en la misma área, le suma la cantidad (no crea otra);
 * - suma la cantidad a la línea de ese artículo en la cotización (una sola línea por artículo, sin repetir el texto).
 * Así la cotización avanza mientras se hace el levantamiento.
 */
export function crearPartida(db: SQLiteDatabase, proyectoId: number, d: DatosPartida, item?: Producto, precioCts = item?.precio_cts ?? 0) {
  return db.withTransactionAsync(async () => {
    if (!item) {
      await db.runAsync(
        'INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, notas, foto_uri, item_id, en_cotizacion) VALUES (?, ?, ?, ?, ?, ?, NULL, 0)',
        proyectoId, d.area, d.equipo, d.cantidad, d.notas, d.foto_uri
      );
      return;
    }
    const misma = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM levantamiento WHERE proyecto_id = ? AND item_id = ? AND lower(trim(area)) = lower(trim(?)) ORDER BY id LIMIT 1',
      proyectoId, item.id, d.area
    );
    if (misma) {
      await db.runAsync('UPDATE levantamiento SET cantidad = cantidad + ? WHERE id = ?', d.cantidad, misma.id);
    } else {
      await db.runAsync(
        'INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, notas, foto_uri, item_id, en_cotizacion) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        proyectoId, d.area, d.equipo, d.cantidad, d.notas, d.foto_uri, item.id
      );
    }
    await crearLinea(db, proyectoId, {
      descripcion: d.equipo,
      cantidad: d.cantidad,
      precio_cts: precioCts,
      tipo: item.tipo,
      costo_cts: item.costo_cts,
      item_id: item.id,
      detalle: item.descripcion,
    });
  });
}

/** Áreas del levantamiento, para quitarlas del texto de los documentos. */
export function listarAreas(db: SQLiteDatabase, proyectoId: number) {
  return db
    .getAllAsync<{ area: string }>('SELECT DISTINCT area FROM levantamiento WHERE proyecto_id = ?', proyectoId)
    .then((r) => r.map((x) => x.area));
}

/** Quita la partida y resta su cantidad de la línea de la cotización (que se borra si queda en cero). */
export function eliminarPartida(db: SQLiteDatabase, id: number) {
  return db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync<Pick<Partida, 'proyecto_id' | 'equipo' | 'cantidad' | 'item_id' | 'en_cotizacion'>>(
      'SELECT proyecto_id, equipo, cantidad, item_id, en_cotizacion FROM levantamiento WHERE id = ?',
      id
    );
    if (!p) return;
    // datos anteriores a la suma de líneas: una línea por partida, enlazada por partida_id
    const propia = await db.runAsync('DELETE FROM cotizacion_items WHERE partida_id = ?', id);
    if (propia.changes === 0 && p.en_cotizacion === 1) {
      const linea =
        p.item_id !== null
          ? await db.getFirstAsync<{ id: number; cantidad: number }>(
              'SELECT id, cantidad FROM cotizacion_items WHERE proyecto_id = ? AND item_id = ? ORDER BY id LIMIT 1',
              p.proyecto_id, p.item_id
            )
          : await db.getFirstAsync<{ id: number; cantidad: number }>(
              'SELECT id, cantidad FROM cotizacion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1',
              p.proyecto_id, p.equipo
            );
      if (linea) {
        if (linea.cantidad - p.cantidad > 0) await db.runAsync('UPDATE cotizacion_items SET cantidad = cantidad - ? WHERE id = ?', p.cantidad, linea.id);
        else await db.runAsync('DELETE FROM cotizacion_items WHERE id = ?', linea.id);
      }
    }
    await db.runAsync('DELETE FROM levantamiento WHERE id = ?', id);
  });
}

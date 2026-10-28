import type { SQLiteDatabase } from 'expo-sqlite';

import { totales } from '../dinero';
import { contarCambios } from '../ejecucion';
import { listarProyectos, obtenerProyecto, type Etapa, type FiltroProyectos, type Proyecto } from './proyectos';

export interface ResumenProyecto {
  partidas: number;
  lineas: number;
  total_cts: number;
  entradas: number;
  factura: { ncf: string; saldo_cts: number; anulada: boolean } | null;
  /** null si la ejecución no ha empezado. */
  ejecucion: { cambios: number; real_cts: number; comprobantes: number } | null;
}

export interface ProyectoConResumen {
  proyecto: Proyecto;
  resumen: ResumenProyecto;
}

const LOTE = 400; // por debajo del límite de variables de SQLite

/** Una sola consulta por tabla para toda la lista: el resumen de cada proyecto no pide más a la base de datos. */
async function filasDe<T extends { proyecto_id: number }>(db: SQLiteDatabase, sql: (marcas: string) => string, ids: number[]) {
  const por = new Map<number, T[]>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const filas = await db.getAllAsync<T>(sql(lote.map(() => '?').join(',')), lote);
    for (const f of filas) por.set(f.proyecto_id, [...(por.get(f.proyecto_id) ?? []), f]);
  }
  return por;
}

type ItemCot = { proyecto_id: number; cantidad: number; precio_cts: number; descuento_pct: number };
type ItemEj = ItemCot & { cantidad_cotizada: number };
type Cuenta = { proyecto_id: number; n: number };

/** Lo que cada proyecto lleva hecho en cada paso. Es la única forma de calcularlo, para una fila o para toda la lista. */
async function resumenes(db: SQLiteDatabase, proyectos: Proyecto[]): Promise<Map<number, ResumenProyecto>> {
  const ids = proyectos.map((p) => p.id);
  const salida = new Map<number, ResumenProyecto>();
  if (ids.length === 0) return salida;

  const cuenta = (tabla: 'levantamiento' | 'bitacora' | 'comprobantes') =>
    filasDe<Cuenta>(db, (m) => `SELECT proyecto_id, COUNT(*) AS n FROM ${tabla} WHERE proyecto_id IN (${m}) GROUP BY proyecto_id`, ids);
  const [partidas, entradas, comprobantes, lineas, ejecucion, facturas] = await Promise.all([
    cuenta('levantamiento'),
    cuenta('bitacora'),
    cuenta('comprobantes'),
    filasDe<ItemCot>(db, (m) => `SELECT proyecto_id, cantidad, precio_cts, descuento_pct FROM cotizacion_items WHERE proyecto_id IN (${m})`, ids),
    filasDe<ItemEj>(
      db,
      (m) => `SELECT proyecto_id, cantidad, cantidad_cotizada, precio_cts, descuento_pct FROM ejecucion_items WHERE proyecto_id IN (${m})`,
      ids
    ),
    filasDe<{ proyecto_id: number; ncf: string; total_cts: number; anulada: number; pagado: number }>(
      db,
      (m) =>
        `SELECT f.proyecto_id, f.ncf, f.total_cts, f.anulada, COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0) AS pagado
         FROM facturas f WHERE f.proyecto_id IN (${m})`,
      ids
    ),
  ]);

  for (const p of proyectos) {
    const cot = lineas.get(p.id) ?? [];
    const ej = ejecucion.get(p.id) ?? [];
    const f = facturas.get(p.id)?.[0];
    const conItbis = p.precios_con_itbis === 1;
    salida.set(p.id, {
      partidas: partidas.get(p.id)?.[0]?.n ?? 0,
      lineas: cot.length,
      total_cts: totales(cot, p.impuesto_pct, conItbis, p.descuento_pct).total,
      entradas: entradas.get(p.id)?.[0]?.n ?? 0,
      factura: f ? { ncf: f.ncf, saldo_cts: Math.max(0, f.total_cts - f.pagado), anulada: f.anulada === 1 } : null,
      ejecucion: p.ejecucion_iniciada_en
        ? { cambios: contarCambios(ej), real_cts: totales(ej, p.impuesto_pct, conItbis, p.descuento_pct).total, comprobantes: comprobantes.get(p.id)?.[0]?.n ?? 0 }
        : null,
    });
  }
  return salida;
}

export async function resumenProyecto(db: SQLiteDatabase, id: number): Promise<ResumenProyecto> {
  const p = await obtenerProyecto(db, id);
  const r = p ? (await resumenes(db, [p])).get(id) : undefined;
  return r ?? { partidas: 0, lineas: 0, total_cts: 0, entradas: 0, factura: null, ejecucion: null };
}

/** Los proyectos (en el orden de prioridad de siempre) con lo que lleva cada uno: partidas, cotización y factura. */
export async function proyectosConResumen(db: SQLiteDatabase, filtro: FiltroProyectos, etapa: Etapa = 'proyecto'): Promise<ProyectoConResumen[]> {
  const lista = await listarProyectos(db, filtro, etapa);
  const r = await resumenes(db, lista);
  return lista.map((proyecto) => ({ proyecto, resumen: r.get(proyecto.id) as ResumenProyecto }));
}

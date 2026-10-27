import type { SQLiteDatabase } from 'expo-sqlite';

import { totales } from '@/dinero';
import { listarLineas, obtenerOpciones } from './cotizacion';
import { obtenerFactura } from './factura';
import { listarProyectos, type FiltroProyectos, type Proyecto } from './proyectos';

export interface ResumenProyecto {
  partidas: number;
  lineas: number;
  total_cts: number;
  entradas: number;
  factura: { ncf: string; saldo_cts: number; anulada: boolean } | null;
}

const contar = (db: SQLiteDatabase, tabla: 'levantamiento' | 'bitacora', id: number) =>
  db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla} WHERE proyecto_id = ?`, id).then((r) => r?.n ?? 0);

/** Lo que el proyecto lleva hecho en cada paso, para mostrarlo sin tener que entrar a cada pantalla. */
export async function resumenProyecto(db: SQLiteDatabase, id: number): Promise<ResumenProyecto> {
  const lineas = await listarLineas(db, id);
  const op = await obtenerOpciones(db, id);
  const f = await obtenerFactura(db, id);
  const pagado = f
    ? ((await db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(monto_cts), 0) AS s FROM pagos WHERE factura_id = ?', f.id))?.s ?? 0)
    : 0;
  return {
    partidas: await contar(db, 'levantamiento', id),
    lineas: lineas.length,
    total_cts: totales(lineas, op.impuesto_pct, op.con_itbis).total,
    entradas: await contar(db, 'bitacora', id),
    factura: f ? { ncf: f.ncf, saldo_cts: Math.max(0, f.total_cts - pagado), anulada: f.anulada === 1 } : null,
  };
}

export interface ProyectoConResumen {
  proyecto: Proyecto;
  resumen: ResumenProyecto;
}

/** Los proyectos (en el orden de prioridad de siempre) con lo que lleva cada uno: partidas, cotización y factura. */
export async function proyectosConResumen(db: SQLiteDatabase, filtro: FiltroProyectos): Promise<ProyectoConResumen[]> {
  const salida: ProyectoConResumen[] = [];
  for (const proyecto of await listarProyectos(db, filtro)) salida.push({ proyecto, resumen: await resumenProyecto(db, proyecto.id) });
  return salida;
}

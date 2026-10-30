import type { SQLiteDatabase } from 'expo-sqlite';

import { precioParaProyecto } from '../dinero';
import { coincide, type Material } from '../materiales';
import { listarCatalogo } from './catalogo';
import { crearLinea, obtenerOpciones } from './cotizacion';

/**
 * Agrega los materiales a la cotización. Si el inventario tiene un artículo cuyo nombre lleva todas las palabras del
 * material, usa su precio; si no, la línea queda a mano con precio 0 para que se llene. Devuelve cuántos no se encontraron.
 */
export async function agregarMateriales(db: SQLiteDatabase, proyectoId: number, materiales: Material[], trabajo: string | null) {
  const op = await obtenerOpciones(db, proyectoId);
  const inventario = (await listarCatalogo(db)).map((p) => ({ p, nombre: p.nombre }));
  let sinInventario = 0;
  await db.withTransactionAsync(async () => {
    for (const m of materiales) {
      const hit = inventario.find((x) => coincide(x.nombre, m));
      if (!hit) sinInventario++;
      await crearLinea(db, proyectoId, {
        descripcion: hit ? hit.p.nombre : m.descripcion,
        cantidad: m.cantidad,
        precio_cts: hit ? precioParaProyecto(hit.p, op.nivel, op.con_itbis, op.impuesto_pct) : 0,
        tipo: hit?.p.tipo ?? 'equipo',
        costo_cts: hit?.p.costo_cts ?? 0,
        item_id: hit?.p.id ?? null,
        detalle: hit?.p.descripcion ?? null,
        trabajo,
      });
    }
  });
  return sinInventario;
}

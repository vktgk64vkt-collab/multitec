// Trabajos dentro de un proyecto: en una casa pueden ir alarma, cámaras y portón a la vez. Cada línea lleva el trabajo al que
// pertenece (o ninguno = "General") y los documentos los muestran como secciones con su subtotal. Módulo puro, sin dependencias.

export const GENERAL = 'General';

/** El nombre que se muestra: una línea sin trabajo cae en "General". */
export const etiquetaTrabajo = (trabajo: string | null | undefined) => trabajo?.trim() || GENERAL;

/** Normaliza lo que escribe el usuario: sin espacios de más; vacío = sin trabajo. */
export function limpiarTrabajo(texto: string | null | undefined): string | null {
  return texto?.trim().replace(/\s+/g, ' ') || null;
}

/**
 * El trabajo que le toca solo a un artículo del inventario: su categoría (CCTV, Alarma, Redes...). Los servicios no
 * pertenecen a un solo sistema, así que quedan sin trabajo hasta que se asignen a mano.
 */
export function trabajoAuto(categoria: string | null | undefined): string | null {
  const c = limpiarTrabajo(categoria);
  return c && c.toLowerCase() !== 'servicios' ? c : null;
}

/** Las líneas agrupadas por trabajo, en el orden en que aparece cada uno. */
export function agruparPorTrabajo<T extends { trabajo?: string | null }>(lineas: T[]): { trabajo: string | null; lineas: T[] }[] {
  const grupos = new Map<string, { trabajo: string | null; lineas: T[] }>();
  for (const l of lineas) {
    const trabajo = limpiarTrabajo(l.trabajo);
    const clave = (trabajo ?? '').toLowerCase();
    const g = grupos.get(clave) ?? { trabajo, lineas: [] };
    g.lineas.push(l);
    grupos.set(clave, g);
  }
  return [...grupos.values()];
}

/** Con un solo trabajo (o ninguno) no hacen falta secciones: el documento se ve como siempre. */
export const hayVariosTrabajos = (lineas: { trabajo?: string | null }[]) => agruparPorTrabajo(lineas).length > 1;

/** Los trabajos distintos que ya existen, sin repetir mayúsculas, para ofrecerlos como opciones. */
export function trabajosDistintos(nombres: (string | null | undefined)[]): string[] {
  const vistos = new Map<string, string>();
  for (const n of nombres) {
    const t = limpiarTrabajo(n);
    if (t && !vistos.has(t.toLowerCase())) vistos.set(t.toLowerCase(), t);
  }
  return [...vistos.values()];
}

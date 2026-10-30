export type Canalizacion = 'EMT' | 'PVC';

export interface Material {
  descripcion: string;
  cantidad: number;
  /** Palabras que debe llevar el nombre del artículo del inventario para considerarlo el mismo material. */
  palabras: string[];
}

export const DESPERDICIO = 0.1;
export const ABRAZADERA_CADA_M = 1.5;
export const CODO_CADA_M = 5; // esquinas estimadas si no se indican
// shortcut: tubo fijo de 3 m para ambos tipos, cambiar si un suplidor vende otro largo
export const LARGO_TUBO_M = 3;

/**
 * Materiales de una canalización recta de `metros`, con 10 % de sobrante. Los codos son `esquinas` (si no se indican,
 * uno cada 5 m); las uniones, una por cada empalme entre tubos; las abrazaderas, una cada 1,5 m más la del arranque.
 */
export function calcularMateriales(tipo: Canalizacion, metros: number, esquinas?: number): Material[] {
  if (!Number.isFinite(metros) || metros <= 0) return [];
  const tubos = Math.ceil((metros * (1 + DESPERDICIO)) / LARGO_TUBO_M);
  const codos = esquinas !== undefined && Number.isFinite(esquinas) && esquinas >= 0 ? Math.floor(esquinas) : Math.floor(metros / CODO_CADA_M);
  const filas: [string, number, string][] = [
    [`Tubo ${tipo} 3 m`, tubos, 'tubo'],
    [`Abrazadera ${tipo}`, Math.ceil(metros / ABRAZADERA_CADA_M) + 1, 'abrazadera'],
    [`Codo ${tipo}`, codos, 'codo'],
    [`Unión ${tipo}`, tubos - 1, 'union'],
  ];
  return filas.filter(([, n]) => n > 0).map(([descripcion, cantidad, clave]) => ({ descripcion, cantidad, palabras: [clave === 'union' ? 'uni' : clave, tipo.toLowerCase()] }));
}

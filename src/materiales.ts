export type Canalizacion = 'EMT' | 'PVC';

/** Diámetros comerciales de 1/2" a 2". */
export const DIAMETROS = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2'] as const;
export type Diametro = (typeof DIAMETROS)[number];

export interface Material {
  descripcion: string;
  cantidad: number;
  clave: 'tubo' | 'abrazadera' | 'codo' | 'union';
  tipo: Canalizacion;
  diametro: Diametro;
}

export const DESPERDICIO = 0.1;
export const ABRAZADERA_CADA_M = 1.5;
export const CODO_CADA_M = 5; // esquinas estimadas si no se indican
// shortcut: tubo fijo de 3 m para todos los diámetros, cambiar si un suplidor vende otro largo
export const LARGO_TUBO_M = 3;

/**
 * Materiales de una canalización recta de `metros`, con 10 % de sobrante. Los codos son `esquinas` (si no se indican,
 * uno cada 5 m); las uniones, una por cada empalme entre tubos; las abrazaderas, una cada 1,5 m más la del arranque.
 */
export function calcularMateriales(tipo: Canalizacion, diametro: Diametro, metros: number, esquinas?: number): Material[] {
  if (!Number.isFinite(metros) || metros <= 0) return [];
  const tubos = Math.ceil((metros * (1 + DESPERDICIO)) / LARGO_TUBO_M);
  const codos = esquinas !== undefined && Number.isFinite(esquinas) && esquinas >= 0 ? Math.floor(esquinas) : Math.floor(metros / CODO_CADA_M);
  const d = `${diametro}"`;
  const filas: [string, number, Material['clave']][] = [
    [`Tubo ${tipo} ${d} x 3 m`, tubos, 'tubo'],
    [`Abrazadera ${tipo} ${d}`, Math.ceil(metros / ABRAZADERA_CADA_M) + 1, 'abrazadera'],
    [`Codo ${tipo} ${d}`, codos, 'codo'],
    [`Unión ${tipo} ${d}`, tubos - 1, 'union'],
  ];
  return filas.filter(([, n]) => n > 0).map(([descripcion, cantidad, clave]) => ({ descripcion, cantidad, clave, tipo, diametro }));
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿El nombre del inventario es este material? Compara pieza, tipo y diámetro ("1 1/2", "1-1/2" y 1.5 no se confunden con "1/2"). */
export function coincide(nombre: string, m: Material): boolean {
  // "1 1/2" -> "1-1/2"; comillas, ", '' y "pulg" se vuelven una sola marca
  const n = ' ' + sinAcentos(nombre).replace(/(\d) (\d\/\d)/g, '$1-$2').replace(/''|”|“|"|pulgadas?|pulg\.?|\bin\b/g, '"') + ' ';
  const pieza = m.clave === 'union' ? 'uni' : m.clave;
  if (!n.includes(pieza) || !n.includes(m.tipo.toLowerCase())) return false;
  const d = m.diametro.replace(/[/-]/g, (c) => '\\' + c);
  // el diámetro no puede ir pegado a otro número, ni ser la parte final de una mixta ("1-1/2" no es "1/2")
  return new RegExp(`[^\\d/-]${d}\\s?"`).test(n);
}

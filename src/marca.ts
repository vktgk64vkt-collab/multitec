// Identidad de los documentos (cotización, propuesta, factura). No hay ninguna empresa fija: el logo, el nombre,
// el lema y el color salen del perfil de cada usuario (Más, Mi empresa). Aquí solo está lo que se calcula con ellos.

/** Color de los documentos mientras el usuario no elige uno. */
export const COLOR_BASE = '#0f2130';

/** Colores sugeridos al elegir la marca. */
export const COLORES_SUGERIDOS = ['#0f2130', '#1e5aa8', '#045883', '#0f766e', '#15803d', '#b45309', '#b91c1c', '#6d28d9', '#334155'];

export const esColorHex = (t: string | null | undefined): t is string => /^#[0-9a-fA-F]{6}$/.test((t ?? '').trim());

const aRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

const aHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla `hex` con `destino` (0 = igual, 1 = destino). */
function mezclar(hex: string, destino: [number, number, number], k: number) {
  return aHex(aRgb(hex).map((v, i) => v + (destino[i] - v) * k));
}

const luminancia = (hex: string) => {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Paleta completa a partir de un solo color de marca. Un color no válido usa el base. */
export function paleta(color?: string | null) {
  const principal = (esColorHex(color) ? color.trim() : COLOR_BASE).toLowerCase();
  return {
    principal,
    claro: mezclar(principal, [255, 255, 255], 0.45), // acentos y rótulos
    oscuro: mezclar(principal, [0, 0, 0], 0.4), // textos de títulos
    suave: mezclar(principal, [255, 255, 255], 0.93), // fondos de cuadros
    linea: mezclar(principal, [255, 255, 255], 0.84), // filetes de tabla
    // texto sobre el color de marca: blanco, salvo que el color sea tan claro que no se lea
    sobrePrincipal: luminancia(principal) > 0.45 ? '#1a1a1a' : '#ffffff',
    texto: '#303233',
  };
}

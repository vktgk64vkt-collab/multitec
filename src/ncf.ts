/** El NCF que sigue al último usado: misma serie y mismo largo ("B0100000045" -> "B0100000046"). null si no se puede deducir. */
export function incrementarNcf(ultimo: string | null | undefined): string | null {
  const m = ultimo?.trim().toUpperCase().match(/^([BE]\d{2})(\d{8}|\d{10})$/);
  if (!m) return null;
  const siguiente = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return siguiente.length > m[2].length ? null : m[1] + siguiente; // se agotó la serie: que lo escriban a mano
}

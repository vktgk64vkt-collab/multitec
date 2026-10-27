// Ejecución del proyecto: el trabajo real entre la cotización y la factura. Aquí se arregla lo que cambió (equipos que
// se agregan, se quitan o cambian de cantidad) y lo que se factura es el resultado final. Módulo puro, sin dependencias.

export interface LineaComparable {
  cantidad: number; // lo que realmente se usó o se va a facturar
  cantidad_cotizada: number; // lo que decía la cotización cuando empezó la ejecución (0 si se agregó después)
}

export type Cambio = 'igual' | 'agregado' | 'quitado' | 'cambio';

export function tipoCambio(l: LineaComparable): Cambio {
  if (l.cantidad_cotizada === 0) return l.cantidad > 0 ? 'agregado' : 'igual'; // agregada y ya en cero: no queda nada que mostrar
  if (l.cantidad === 0) return 'quitado';
  return l.cantidad === l.cantidad_cotizada ? 'igual' : 'cambio';
}

/** Cómo se lee el cambio de una línea: "", "Agregado", "Quitado" o "Cotizado 4, ahora 3". */
export function textoCambio(l: LineaComparable): string {
  switch (tipoCambio(l)) {
    case 'agregado':
      return 'Agregado';
    case 'quitado':
      return 'Quitado';
    case 'cambio':
      return `Cotizado ${l.cantidad_cotizada}, ahora ${l.cantidad}`;
    default:
      return '';
  }
}

export function contarCambios(ls: LineaComparable[]): number {
  return ls.filter((l) => tipoCambio(l) !== 'igual').length;
}

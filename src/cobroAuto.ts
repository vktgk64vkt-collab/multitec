// Cobros automáticos de la cotización: servicios del inventario cuya cantidad o precio los fija el resto de la cotización.
//  - camara: mano de obra por cámara. Cantidad = cámaras cotizadas (de cualquier tipo o marca).
//  - punto:  mano de obra por punto de red. Cantidad = unidades de los artículos que cuentan como punto (se eligen).
//  - alarma: cantidad 1 y precio = un porcentaje de lo que se vende en equipos de alarma.
// Módulo puro (sin base de datos) para poder probarlo.
import { importe } from './dinero';
import { normalizar } from './pedido';

export const COBROS = ['camara', 'punto', 'alarma'] as const;
export type Cobro = (typeof COBROS)[number];

export const ETIQUETA_COBRO: Record<Cobro, string> = {
  camara: 'Por cada cámara',
  punto: 'Por cada punto de red',
  alarma: '% de los equipos de alarma',
};

/** Qué artículos cuentan como "punto de red" mientras no se elija otra cosa (tipos del inventario, separados por coma). */
export const TIPOS_PUNTO_DEFECTO = 'Jack, Face plate';

export const esCobro = (v: string | null | undefined): v is Cobro => !!v && (COBROS as readonly string[]).includes(v);

/** "Jack, Face plate" -> ['Jack', 'Face plate'] */
export const listaTipos = (param: string | null | undefined) =>
  (param?.trim() ? param : TIPOS_PUNTO_DEFECTO).split(',').map((t) => t.trim()).filter(Boolean);

/** "15" o "12,5" -> 15 o 12.5. null si no es un porcentaje válido (mayor que 0 y hasta 1000). */
export function porcentajeDe(param: string | null | undefined): number | null {
  const n = Number((param ?? '').trim().replace(',', '.'));
  return (param ?? '').trim() !== '' && Number.isFinite(n) && n > 0 && n <= 1000 ? n : null;
}

/** El texto que acompaña a la línea en la cotización. */
export function textoCobro(cobro: string | null | undefined, param: string | null | undefined): string | null {
  if (cobro === 'camara') return 'automático: una por cada cámara';
  if (cobro === 'punto') return `automático: uno por cada punto (${listaTipos(param).join(', ')})`;
  if (cobro === 'alarma') return `automático: ${porcentajeDe(param) ?? '?'} % de los equipos de alarma`;
  return null;
}

export interface LineaBase {
  tipo: string; // 'equipo' | 'servicio'
  f_tipo: string | null;
  categoria: string | null;
  cantidad: number;
  precio_cts: number;
  descuento_pct: number;
  cobro_auto: string | null; // la línea es un cobro automático (no cuenta como equipo)
}

export interface ResultadoCobro {
  cantidad: number;
  precio_cts: number | null; // null = el precio no lo fija la regla (se queda el del inventario)
  vacio: boolean; // no hay nada que cobrar (sin cámaras, sin puntos o sin equipos de alarma)
}

/** Lo que le toca a un cobro automático según las demás líneas de la cotización. null = regla desconocida o mal configurada. */
export function calcularCobro(cobro: string, param: string | null, lineas: LineaBase[]): ResultadoCobro | null {
  const equipos = lineas.filter((l) => !l.cobro_auto && l.tipo === 'equipo');
  if (cobro === 'camara') {
    const n = equipos.filter((l) => normalizar(l.f_tipo ?? '').startsWith('camara')).reduce((s, l) => s + l.cantidad, 0);
    return { cantidad: n, precio_cts: null, vacio: n === 0 };
  }
  if (cobro === 'punto') {
    const tipos = new Set(listaTipos(param).map(normalizar));
    const n = equipos.filter((l) => tipos.has(normalizar(l.f_tipo ?? ''))).reduce((s, l) => s + l.cantidad, 0);
    return { cantidad: n, precio_cts: null, vacio: n === 0 };
  }
  if (cobro === 'alarma') {
    const pct = porcentajeDe(param);
    if (pct === null) return null;
    const venta = equipos.filter((l) => l.categoria === 'Alarma').reduce((s, l) => s + importe(l), 0);
    return { cantidad: 1, precio_cts: Math.round((venta * pct) / 100), vacio: venta === 0 };
  }
  return null;
}

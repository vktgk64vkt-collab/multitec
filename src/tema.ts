import { StyleSheet } from 'react-native';

export const color = {
  primario: '#0f2130',
  fondo: '#f6f0e8',
  tarjeta: '#ffffff',
  texto: '#101828',
  suave: '#596273',
  borde: '#e6dccf',
  ok: '#12805c',
  alerta: '#b54708',
  peligro: '#c0262d',
  info: '#1d5fa8',
};

/** Un color por estado, igual en todas las pantallas. */
export const colorEstado: Record<string, string> = {
  borrador: color.suave,
  enviada: color.info,
  aprobada: color.ok,
  rechazada: color.peligro,
  levantamiento: color.suave,
  cotizado: color.info,
  'en ejecución': color.alerta,
  facturado: color.primario,
  cerrado: color.ok,
};

/** Tarjeta plana: sin sombra, solo un filo fino. Menos ruido y más aire. */
export const tarjeta = {
  backgroundColor: color.tarjeta,
  borderRadius: 14,
  padding: 14,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: color.borde,
} as const;

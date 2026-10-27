export const color = {
  primario: '#0f2130',
  fondo: '#f6f0e8',
  tarjeta: '#ffffff',
  texto: '#101828',
  suave: '#596273',
  borde: '#e6dccf',
  ok: '#12805c',
  alerta: '#b54708',
};

export const tarjeta = {
  backgroundColor: color.tarjeta,
  borderRadius: 16,
  padding: 16,
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
} as const;

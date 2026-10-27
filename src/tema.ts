export const color = {
  primario: '#1e6fa8',
  fondo: '#f2f4f7',
  tarjeta: '#ffffff',
  texto: '#101828',
  suave: '#667085',
  borde: '#e4e7ec',
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

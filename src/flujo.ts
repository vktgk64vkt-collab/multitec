// El camino de un proyecto: levantamiento, cotización, factura, cobro y cierre. Dice qué toca hacer ahora según en qué va,
// para que no tengas que adivinar en qué pantalla seguir. Módulo puro, sin dependencias de la app, para poder probarlo.

export interface EstadoFlujo {
  estado: string;
  partidas: number;
  lineas: number;
  total_cts: number;
  factura: { ncf: string; saldo_cts: number; anulada: boolean } | null;
}

export interface Paso {
  titulo: string;
  detalle: string;
  boton: string;
  destino: 'levantamiento' | 'cotizacion' | 'factura' | 'cerrar';
}

/** "RD$ 1,500.00" (mismo formato que dinero.moneda, repetido aquí para no depender de otros módulos). */
const rd = (centavos: number) => {
  const [entero, decimales] = (centavos / 100).toFixed(2).split('.');
  return `RD$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
};

/** El paso que sigue para el proyecto, o null si ya está cerrado. */
export function siguientePaso(e: EstadoFlujo): Paso | null {
  if (e.estado === 'cerrado') return null;
  if (e.factura?.anulada) {
    return { titulo: 'Factura anulada', detalle: 'Para volver a facturar, duplica el proyecto.', boton: 'Ver factura', destino: 'factura' };
  }
  if (e.factura && e.factura.saldo_cts > 0) {
    return { titulo: `Falta cobrar ${rd(e.factura.saldo_cts)}`, detalle: `Factura ${e.factura.ncf}`, boton: 'Registrar pago', destino: 'factura' };
  }
  if (e.factura) {
    return { titulo: 'Todo cobrado', detalle: 'Cierra el proyecto para sacarlo de los que están en curso.', boton: 'Cerrar proyecto', destino: 'cerrar' };
  }
  if (e.lineas > 0) {
    return {
      titulo: `Cotización lista: ${rd(e.total_cts)}`,
      detalle: 'Revísala, mándala al cliente o factúrala.',
      boton: 'Abrir cotización',
      destino: 'cotizacion',
    };
  }
  if (e.partidas > 0) {
    return { titulo: 'Arma la cotización', detalle: 'Ya tienes equipos en el levantamiento: pásalos a la cotización y ponles precio.', boton: 'Abrir cotización', destino: 'cotizacion' };
  }
  return { titulo: 'Empieza el levantamiento', detalle: 'Agrega los equipos que ves en el sitio: la cotización se arma sola.', boton: 'Empezar', destino: 'levantamiento' };
}

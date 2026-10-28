// Textos y tiempos del dictado, sin dependencias para poder probarlos. El micrófono en sí está en voz.ts.

/** Tras la última palabra reconocida, se da por terminado el dictado. */
export const SILENCIO_MS = 2800;
/** Si no se reconoce ninguna palabra en este tiempo, se corta y se avisa. */
export const ESPERA_INICIAL_MS = 9000;
/** Si el sistema no confirma que empezó a escuchar en este tiempo, se libera el botón. */
export const ESPERA_ARRANQUE_MS = 4000;

/**
 * Lo que se le dice al usuario por cada error del reconocimiento de voz de iOS. null = no hay nada que decir
 * (por ejemplo, cuando el propio usuario cortó el dictado).
 */
export function mensajeVoz(codigo: string, detalle?: string): string | null {
  switch (codigo) {
    case 'aborted':
      return null;
    case 'no-speech':
      return 'No te escuché. Acerca el teléfono un poco y vuelve a tocar el micrófono.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Activa el micrófono y el reconocimiento de voz para Tekhnia en Ajustes del iPhone.';
    case 'network':
      return 'El reconocimiento de voz de iOS necesita internet. Revisa tu conexión o escribe el pedido.';
    case 'audio-capture':
      return 'El micrófono no está disponible (¿otra app lo está usando, o hay una llamada?). Ciérrala y vuelve a intentar.';
    case 'interrupted':
      return 'Se interrumpió el micrófono (llamada, Siri o una alarma). Vuelve a tocarlo.';
    case 'busy':
      return 'El reconocimiento de voz está ocupado. Espera un segundo y vuelve a tocar el micrófono.';
    default:
      return `No se pudo usar la voz${detalle ? `: ${detalle}` : '.'}`;
  }
}

/** Errores que se arreglan solos reintentando una vez. */
export const reintentable = (codigo: string) => codigo === 'busy';

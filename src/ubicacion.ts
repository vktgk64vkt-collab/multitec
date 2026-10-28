// Ubicación del cliente en Google Maps: un enlace que se abre en la app de Google Maps (o en Safari si no está instalada).
// Se guarda solo el enlace; no hace falta ninguna clave ni SDK. Módulo puro, sin dependencias.

export interface Coordenadas {
  lat: number;
  lng: number;
}

const enRango = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Enlace de Google Maps al punto exacto. */
export function enlaceDeCoordenadas({ lat, lng }: Coordenadas): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Enlace que busca una dirección escrita en Google Maps (para elegir el punto y copiar su enlace). */
export function enlaceDeBusqueda(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`;
}

// google.com/maps, maps.google.com, el enlace corto de la app (maps.app.goo.gl, goo.gl/maps) y share.google
const ENLACE_MAPS = /^https:\/\/(?:(?:www\.|maps\.)?google\.[a-z.]{2,6}\/maps|maps\.app\.goo\.gl\/|goo\.gl\/maps|share\.google\/|g\.co\/kgs)/i;

/** "18.4861, -69.9312" (coordenadas sueltas) -> Coordenadas; null si no lo son. */
export function leerCoordenadas(texto: string): Coordenadas | null {
  const m = texto.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return enRango(lat, lng) ? { lat, lng } : null;
}

/**
 * Lo que el usuario pegó o escribió -> el enlace que se guarda. Acepta un enlace de Google Maps o coordenadas
 * ("18.4861, -69.9312"). Devuelve null si no es ninguna de las dos (para avisar en vez de guardar basura).
 */
export function normalizarUbicacion(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const c = leerCoordenadas(t);
  if (c) return enlaceDeCoordenadas(c);
  return ENLACE_MAPS.test(t) && !/\s/.test(t) ? t : null;
}

/** Las coordenadas que lleva un enlace, si se leen en él (los enlaces cortos de la app no las traen). */
export function coordenadasDeEnlace(enlace: string): Coordenadas | null {
  const patrones = [/[?&](?:query|q|ll)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/];
  for (const p of patrones) {
    const m = enlace.match(p);
    if (m && enRango(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

/** Texto corto de las coordenadas: "18.486100, -69.931200". */
export const textoCoordenadas = ({ lat, lng }: Coordenadas) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

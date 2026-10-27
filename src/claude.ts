// Conexión con la API de Claude para entender pedidos dictados. La clave de API es del usuario y vive en el llavero
// seguro del iPhone (nunca en la base de datos, en el respaldo ni en el código). Sin clave, la app usa el entendedor local.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { armarPeticion, leerRespuesta, MODELO_BASE, type ArticuloPedido, type ResultadoPedido } from './pedido';

const CLAVE_API = 'anthropic_api_key';
const CLAVE_MODELO = 'anthropic_modelo';
const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2026-10-21';
const ESPERA_MAX_MS = 60_000;

const disponible = () => Platform.OS !== 'web';

export async function leerClave(): Promise<string | null> {
  if (!disponible()) return null;
  try {
    return (await SecureStore.getItemAsync(CLAVE_API)) || null;
  } catch {
    return null;
  }
}

export async function guardarClave(clave: string) {
  if (!disponible()) throw new Error('Guardar la clave solo funciona en el iPhone.');
  await SecureStore.setItemAsync(CLAVE_API, clave.trim());
}

export async function borrarClave() {
  if (disponible()) await SecureStore.deleteItemAsync(CLAVE_API);
}

export async function leerModelo(): Promise<string> {
  if (!disponible()) return MODELO_BASE;
  try {
    return (await SecureStore.getItemAsync(CLAVE_MODELO)) || MODELO_BASE;
  } catch {
    return MODELO_BASE;
  }
}

export async function guardarModelo(modelo: string) {
  if (disponible()) await SecureStore.setItemAsync(CLAVE_MODELO, modelo);
}

/** Muestra la clave sin revelarla: sk-ant-…a1b2 */
export const clavePartida = (clave: string) => `${clave.slice(0, 7)}…${clave.slice(-4)}`;

/** Llama a la API y devuelve el cuerpo ya leído; traduce los errores a frases que el usuario entienda. */
async function llamar(clave: string, cuerpo: object): Promise<any> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAX_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(URL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': VERSION_API },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === 'AbortError'
        ? 'Claude tardó demasiado en responder. Intenta de nuevo.'
        : 'No hay conexión a internet. Usa "Entender sin Claude" o intenta cuando tengas señal.'
    );
  } finally {
    clearTimeout(reloj);
  }

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const detalle: string = datos?.error?.message ?? '';
    if (respuesta.status === 401) throw new Error('La clave de API no es válida. Revísala en Más, Asistente Claude.');
    if (respuesta.status === 403) throw new Error('Tu cuenta no tiene permiso para usar este modelo.');
    if (respuesta.status === 404) throw new Error('Ese modelo no está disponible para tu cuenta. Elige otro en Más, Asistente Claude.');
    if (respuesta.status === 429) throw new Error('Demasiadas peticiones seguidas. Espera un minuto e intenta de nuevo.');
    if (respuesta.status >= 500) throw new Error('Claude está saturado en este momento. Intenta en un minuto o usa "Entender sin Claude".');
    // 400: típico cuando se acaba el saldo de la cuenta de la API
    throw new Error(detalle ? `Claude respondió: ${detalle}` : `Error ${respuesta.status} al hablar con Claude.`);
  }
  return datos;
}

/** Prueba corta para confirmar que la clave y el modelo funcionan (gasta una fracción de centavo). */
export async function probarConexion(clave: string, modelo: string) {
  await llamar(clave, { model: modelo, max_tokens: 16, messages: [{ role: 'user', content: 'Responde solo: ok' }] });
}

/** Entiende el pedido dictado con Claude. Lanza un Error con un mensaje listo para mostrar. */
export async function entenderConClaude(texto: string, inventario: ArticuloPedido[], areaActual: string | null): Promise<ResultadoPedido> {
  const clave = await leerClave();
  if (!clave) throw new Error('Falta la clave de API. Agrégala en Más, Asistente Claude.');
  const datos = await llamar(clave, armarPeticion(texto, inventario, await leerModelo(), areaActual));

  if (datos.stop_reason === 'refusal') throw new Error('Claude no quiso procesar este pedido. Usa "Entender sin Claude".');
  if (datos.stop_reason === 'max_tokens') throw new Error('El pedido es demasiado largo. Dicta menos equipos a la vez.');
  const bloque = (datos.content ?? []).find((b: { type: string }) => b.type === 'text');
  if (!bloque) throw new Error('Claude no devolvió una respuesta. Intenta de nuevo.');
  let json: unknown;
  try {
    json = JSON.parse(bloque.text);
  } catch {
    throw new Error('No pude leer la respuesta de Claude. Intenta de nuevo.');
  }
  return leerRespuesta(json, new Set(inventario.map((a) => a.id)));
}

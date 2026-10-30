// Conexión con la API de Claude para entender pedidos dictados. La clave de API es del usuario y vive en el llavero
// seguro del iPhone (nunca en la base de datos, en el respaldo ni en el código). Sin clave, la app usa el entendedor local.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { armarPeticionArticulo, leerArticulo, type BorradorArticulo } from './articuloVoz';
import { armarPeticionPedidoPdf, leerPedidoPdf, MAX_BASE64_PDF, type Fuente, type PedidoLeido } from './pedidoPdf';
import {
  armarPeticionCompra,
  armarPeticionPregunta,
  armarPeticionRedaccion,
  armarPeticionRevision,
  leerCompra,
  leerMensaje,
  leerRespuestaTexto,
  leerRevision,
  MAX_BASE64_IMAGEN,
  type Compra,
  type Imagen,
  type LineaRevision,
  type Observacion,
  type TipoRedaccion,
} from './ia';
import { armarPeticion, leerRespuesta, MODELO_BASE, type ArticuloPedido, type ResultadoPedido } from './pedido';

const CLAVE_API = 'anthropic_api_key';
const CLAVE_MODELO = 'anthropic_modelo';
const CLAVE_MODO = 'entender_modo';
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

/** Con qué se entiende lo dictado: Claude primero (con respaldo del iPhone sin internet) o solo el entendedor del iPhone. */
export type ModoEntender = 'claude' | 'local';

export async function leerModoEntender(): Promise<ModoEntender> {
  if (!disponible()) return 'claude';
  try {
    return (await SecureStore.getItemAsync(CLAVE_MODO)) === 'local' ? 'local' : 'claude';
  } catch {
    return 'claude';
  }
}

export async function guardarModoEntender(modo: ModoEntender) {
  if (disponible()) await SecureStore.setItemAsync(CLAVE_MODO, modo);
}

/** Muestra la clave sin revelarla: sk-ant-…a1b2 */
export const clavePartida = (clave: string) => `${clave.slice(0, 7)}…${clave.slice(-4)}`;

/** Llama a la API y devuelve el cuerpo ya leído; traduce los errores a frases que el usuario entienda. */
async function llamar(clave: string, cuerpo: object, intento = 0): Promise<any> {
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
  // saturado o muchas peticiones: una sola repetición tras una pausa corta evita pedirle al usuario que reintente
  if ((respuesta.status === 429 || respuesta.status >= 500) && intento < 1) {
    await new Promise((r) => setTimeout(r, 3000));
    return llamar(clave, cuerpo, intento + 1);
  }
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
export async function entenderConClaude(texto: string, inventario: ArticuloPedido[], areaActual: string | null, imagen?: Imagen): Promise<ResultadoPedido> {
  const clave = await claveObligatoria();
  if (imagen) revisarImagen(imagen);
  const datos = await llamar(clave, armarPeticion(texto, inventario, await leerModelo(), areaActual, imagen));
  return leerRespuesta(jsonDeRespuesta(datos, 'El pedido es demasiado largo. Dicta menos equipos a la vez.'), new Set(inventario.map((a) => a.id)));
}

async function claveObligatoria() {
  const clave = await leerClave();
  if (!clave) throw new Error('Falta la clave de API. Agrégala en Más, Asistente Claude.');
  return clave;
}

function revisarImagen(i: Imagen) {
  if (i.base64.length > MAX_BASE64_IMAGEN) throw new Error('La foto pesa demasiado. Toma otra con menos resolución o recórtala.');
}

/** Revisa la cotización antes de enviarla: lo que falta, cantidades que no cuadran, márgenes bajos. */
export async function revisarCotizacionConClaude(lineas: LineaRevision[]): Promise<{ resumen: string; observaciones: Observacion[] }> {
  const clave = await claveObligatoria();
  const datos = await llamar(clave, armarPeticionRevision(lineas, await leerModelo()));
  return leerRevision(jsonDeRespuesta(datos, 'La cotización es demasiado larga para revisarla de una vez.'));
}

/** Lee la factura de un proveedor (foto) y la relaciona con tu inventario. No guarda nada. */
export async function leerFacturaProveedor(imagen: Imagen, inventario: ArticuloPedido[]): Promise<Compra> {
  const clave = await claveObligatoria();
  revisarImagen(imagen);
  const datos = await llamar(clave, armarPeticionCompra(imagen, inventario, await leerModelo()));
  return leerCompra(jsonDeRespuesta(datos, 'La factura tiene demasiados artículos para leerla de una vez. Toma la foto por partes.'), new Set(inventario.map((a) => a.id)));
}

/** Lee el pedido de un suplidor (PDF o foto) y lo convierte en artículos con la nomenclatura estándar. No guarda nada. */
export async function leerPedidoProveedor(fuente: Fuente): Promise<PedidoLeido> {
  const clave = await claveObligatoria();
  if (fuente.tipo === 'imagen') revisarImagen(fuente);
  else if (fuente.base64.length > MAX_BASE64_PDF) throw new Error('El PDF pesa demasiado (máximo 22 MB). Divídelo en partes.');
  const datos = await llamar(clave, armarPeticionPedidoPdf(fuente, await leerModelo()));
  return leerPedidoPdf(jsonDeRespuesta(datos, 'El pedido tiene demasiados artículos para leerlo de una vez. Divide el PDF o toma la foto por partes.'));
}

/** Contesta una pregunta sobre el negocio con los datos que se le pasan (ya armados en texto). */
export async function preguntarAClaude(pregunta: string, datos: string): Promise<string> {
  const clave = await claveObligatoria();
  const r = await llamar(clave, armarPeticionPregunta(pregunta, datos, await leerModelo()));
  return leerRespuestaTexto(jsonDeRespuesta(r, 'La respuesta salió demasiado larga. Pregunta algo más concreto.'));
}

/** Redacta un mensaje (seguimiento, cobro) o el resumen del trabajo de una propuesta. */
export async function redactarConClaude(tipo: TipoRedaccion, datos: Record<string, string | null | undefined>, empresa: string | null): Promise<string> {
  const clave = await claveObligatoria();
  const r = await llamar(clave, armarPeticionRedaccion(tipo, datos, empresa, await leerModelo()));
  return leerMensaje(jsonDeRespuesta(r, 'El mensaje salió demasiado largo.'));
}

/** El JSON que devolvió Claude, o un Error con un mensaje listo para mostrar. */
function jsonDeRespuesta(datos: { stop_reason?: string; content?: { type: string; text: string }[] }, mensajeLargo: string): unknown {
  if (datos.stop_reason === 'refusal') throw new Error('Claude no quiso procesar esto. Escríbelo a mano.');
  if (datos.stop_reason === 'max_tokens') throw new Error(mensajeLargo);
  const bloque = (datos.content ?? []).find((b) => b.type === 'text');
  if (!bloque) throw new Error('Claude no devolvió una respuesta. Intenta de nuevo.');
  try {
    return JSON.parse(bloque.text);
  } catch {
    throw new Error('No pude leer la respuesta de Claude. Intenta de nuevo.');
  }
}

/** Entiende "agrégame una cámara IP de 4mpx bullet al inventario" con Claude. No guarda nada: devuelve el borrador para confirmarlo. */
export async function entenderArticuloConClaude(texto: string): Promise<BorradorArticulo> {
  const clave = await leerClave();
  if (!clave) throw new Error('Falta la clave de API. Agrégala en Más, Asistente Claude.');
  const datos = await llamar(clave, armarPeticionArticulo(texto, await leerModelo()));
  return leerArticulo(jsonDeRespuesta(datos, 'La descripción es demasiado larga. Dicta un solo artículo.'));
}

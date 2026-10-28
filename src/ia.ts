// Lo que Claude hace además de entender pedidos: revisar una cotización, leer la factura de un proveedor, contestar
// preguntas sobre el negocio y redactar mensajes. Módulo puro (sin red ni base de datos) para poder probarlo.
// Claude solo propone: nada de esto se guarda sin que el usuario lo confirme.
import type { ArticuloPedido } from './pedido';

type Esquema = Record<string, unknown>;
export interface Imagen {
  base64: string;
  mime: string;
}

/** Límite de la API por imagen es 5 MB; en base64 son ~1,37 veces más caracteres. */
export const MAX_BASE64_IMAGEN = 6_500_000;

const texto = { type: 'string' } as const;
const nulo = (t: Esquema) => ({ anyOf: [t, { type: 'null' }] });

function peticion(modelo: string, sistema: string, contenido: string | object[], esquema: Esquema, maxTokens: number) {
  return {
    model: modelo,
    max_tokens: maxTokens,
    system: sistema,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
    messages: [{ role: 'user', content: contenido }],
  };
}

export const bloqueImagen = (i: Imagen) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.base64 } });

const pesos = (cts: number) => (cts / 100).toFixed(2);

// ---------- revisor de cotizaciones ----------

export interface LineaRevision {
  descripcion: string;
  cantidad: number;
  precio_cts: number;
  costo_cts: number;
  tipo: string;
  trabajo: string | null;
}
export interface Observacion {
  gravedad: 'alta' | 'media' | 'baja';
  texto: string;
}

const REVISION_INSTRUCCIONES = `Eres el revisor técnico de una empresa de seguridad electrónica (cámaras, alarmas, control de acceso), redes y domótica en República Dominicana.
Te llega una cotización lista para enviar al cliente. Busca lo que un técnico experimentado notaría ANTES de enviarla:
- Lo que falta para que el sistema funcione: grabador sin disco duro, cámaras IP sin switch PoE o sin cable, cámaras sin fuente o sin ups, alarma sin sirena o sin batería, control de acceso sin cerradura o fuente, gabinete o rack sin canalización, falta de mano de obra o de instalación.
- Cantidades que no cuadran (8 cámaras y un NVR de 4 canales, 3 sensores y 1 cable para todo).
- Precios en cero, o márgenes muy bajos o negativos (se te da el margen cuando hay costo).
- Líneas repetidas o contradictorias.
Reglas:
- Solo observaciones que ayuden de verdad. Si la cotización está completa, devuelve la lista vacía.
- Máximo 6, las más importantes primero. Cada una breve y concreta, en español, nombrando el equipo.
- "alta" = el sistema no funcionaría o se pierde dinero; "media" = probable olvido; "baja" = sugerencia.
- "resumen": una frase sobre el estado general de la cotización.`;

const ESQUEMA_REVISION = {
  type: 'object',
  properties: {
    resumen: texto,
    observaciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: { gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] }, texto },
        required: ['gravedad', 'texto'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'observaciones'],
  additionalProperties: false,
} as const;

export function armarPeticionRevision(lineas: LineaRevision[], modelo: string) {
  const filas = lineas
    .map((l) => {
      const margen = l.costo_cts > 0 && l.precio_cts > 0 ? `${Math.round(((l.precio_cts - l.costo_cts) / l.precio_cts) * 100)}%` : '—';
      return `${l.cantidad} × ${l.descripcion} | ${l.tipo} | precio ${pesos(l.precio_cts)} | margen ${margen}${l.trabajo ? ` | trabajo: ${l.trabajo}` : ''}`;
    })
    .join('\n');
  return peticion(modelo, REVISION_INSTRUCCIONES, `Cotización:\n${filas}`, ESQUEMA_REVISION, 1500);
}

export function leerRevision(datos: unknown): { resumen: string; observaciones: Observacion[] } {
  const d = (datos ?? {}) as { resumen?: unknown; observaciones?: unknown };
  if (!Array.isArray(d.observaciones)) throw new Error('La respuesta de Claude no tiene el formato esperado.');
  const observaciones = d.observaciones
    .map((o: Record<string, unknown>): Observacion => ({
      gravedad: o.gravedad === 'alta' || o.gravedad === 'media' ? o.gravedad : 'baja',
      texto: typeof o.texto === 'string' ? o.texto.trim() : '',
    }))
    .filter((o) => o.texto)
    .slice(0, 6);
  return { resumen: typeof d.resumen === 'string' ? d.resumen.trim() : '', observaciones };
}

// ---------- factura de proveedor por foto ----------

export interface LineaCompra {
  texto: string;
  id: number | null; // artículo del inventario; null = no se encontró
  cantidad: number;
  costo_cts: number; // por unidad, 0 = no se pudo leer
}
export interface Compra {
  proveedor: string | null;
  lineas: LineaCompra[];
  notas: string | null;
}

const COMPRA_INSTRUCCIONES = `Eres el asistente de una empresa de seguridad electrónica, redes y domótica en República Dominicana.
La imagen es la factura o el albarán de un proveedor. Lee cada artículo comprado y relaciónalo con UN artículo del inventario de abajo.
Reglas:
- Usa SOLO los ids del inventario. Nunca inventes uno. Si nada corresponde con seguridad, item_id = null (no fuerces coincidencias dudosas).
- "texto": la descripción tal como aparece en la factura.
- "cantidad": unidades compradas (entero, mínimo 1).
- "costo_unitario": lo que costó UNA unidad, en pesos dominicanos, antes de ITBIS si la factura lo separa. Si solo ves el total de la línea, divide entre la cantidad. Si no se lee, null.
- "proveedor": el nombre del proveedor si aparece; si no, null.
- "notas": una frase corta si algo no se leyó bien (foto borrosa, moneda distinta a pesos...); si no, null.
- Ignora subtotales, impuestos, envío y datos que no sean artículos.

Formato del inventario, una línea por artículo: id | nombre | apodos | tipo`;

const ESQUEMA_COMPRA = {
  type: 'object',
  properties: {
    proveedor: nulo(texto),
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { texto, item_id: nulo({ type: 'integer' }), cantidad: { type: 'integer' }, costo_unitario: nulo({ type: 'number' }) },
        required: ['texto', 'item_id', 'cantidad', 'costo_unitario'],
        additionalProperties: false,
      },
    },
    notas: nulo(texto),
  },
  required: ['proveedor', 'lineas', 'notas'],
  additionalProperties: false,
} as const;

const listaInventario = (inventario: ArticuloPedido[]) =>
  [...inventario]
    .sort((a, b) => a.id - b.id)
    .map((a) => `${a.id} | ${a.nombre} | ${a.apodos.join('; ')} | ${a.tipo}`)
    .join('\n');

export function armarPeticionCompra(imagen: Imagen, inventario: ArticuloPedido[], modelo: string) {
  return peticion(
    modelo,
    `${COMPRA_INSTRUCCIONES}\n\nINVENTARIO:\n${listaInventario(inventario)}`,
    [bloqueImagen(imagen), { type: 'text', text: 'Factura del proveedor. Extrae los artículos comprados.' }],
    ESQUEMA_COMPRA,
    4096
  );
}

export function leerCompra(datos: unknown, idsValidos: Set<number>): Compra {
  const d = (datos ?? {}) as { proveedor?: unknown; lineas?: unknown; notas?: unknown };
  if (!Array.isArray(d.lineas)) throw new Error('La respuesta de Claude no tiene el formato esperado.');
  const lineas = d.lineas.map((x: Record<string, unknown>): LineaCompra => {
    const cantidad = Number.isFinite(Number(x.cantidad)) ? Math.max(1, Math.round(Number(x.cantidad))) : 1;
    const costo = typeof x.costo_unitario === 'number' && Number.isFinite(x.costo_unitario) && x.costo_unitario > 0 && x.costo_unitario < 100_000_000 ? Math.round(x.costo_unitario * 100) : 0;
    return {
      texto: typeof x.texto === 'string' ? x.texto.trim() : '',
      id: typeof x.item_id === 'number' && idsValidos.has(x.item_id) ? x.item_id : null,
      cantidad,
      costo_cts: costo,
    };
  });
  return {
    proveedor: typeof d.proveedor === 'string' && d.proveedor.trim() ? d.proveedor.trim() : null,
    lineas: lineas.filter((l) => l.texto || l.id !== null),
    notas: typeof d.notas === 'string' && d.notas.trim() ? d.notas.trim() : null,
  };
}

// ---------- preguntas sobre el negocio ----------

const PREGUNTA_INSTRUCCIONES = `Eres el asistente del dueño de una empresa de seguridad electrónica, redes y domótica en República Dominicana.
Contesta su pregunta usando SOLO los datos de abajo (son sus datos reales, con montos en pesos dominicanos, RD$). Hoy es la fecha indicada.
Reglas:
- Respuesta corta y directa, en español, con las cifras exactas. Si ayuda, una lista breve de nombres con su monto.
- Si los datos no alcanzan para responder, dilo y di qué falta. No inventes cifras.
- Una factura anulada no cuenta. "Vencida" es una factura con saldo cuya fecha de vencimiento ya pasó.`;

const ESQUEMA_RESPUESTA = { type: 'object', properties: { respuesta: texto }, required: ['respuesta'], additionalProperties: false } as const;

export function armarPeticionPregunta(pregunta: string, datos: string, modelo: string) {
  return peticion(modelo, `${PREGUNTA_INSTRUCCIONES}\n\nDATOS:\n${datos}`, pregunta.trim(), ESQUEMA_RESPUESTA, 1500);
}

export function leerRespuestaTexto(datos: unknown): string {
  const t = (datos as { respuesta?: unknown } | null)?.respuesta;
  if (typeof t !== 'string' || !t.trim()) throw new Error('Claude no devolvió una respuesta. Intenta de nuevo.');
  return t.trim();
}

// ---------- redacción ----------

export type TipoRedaccion = 'seguimiento' | 'cobro' | 'alcance';

const REDACCION: Record<TipoRedaccion, string> = {
  seguimiento: `Escribe un mensaje de WhatsApp para dar seguimiento a una cotización que el cliente aún no ha respondido.
Cordial y breve (máximo 60 palabras), sin presionar, ofreciendo resolver dudas o ajustar la cotización. Menciona el monto total y de qué trata el trabajo. Sin asuntos ni "Estimado": es WhatsApp.`,
  cobro: `Escribe un mensaje de WhatsApp para cobrar el saldo de una factura.
Amable pero claro (máximo 60 palabras): factura, saldo pendiente y fecha de vencimiento si existe. Si ya venció, recuérdalo con cortesía y pregunta cuándo puede pagar. Sin amenazas.`,
  alcance: `Redacta el "resumen del trabajo" que va al inicio de una propuesta para el cliente.
Dos o tres frases (máximo 70 palabras) que describan QUÉ se va a instalar y para qué le sirve al cliente. Sin precios, sin marcas ni modelos, sin saludos. Primera persona del plural ("Instalaremos...").`,
};

export function armarPeticionRedaccion(tipo: TipoRedaccion, datos: Record<string, string | null | undefined>, empresa: string | null, modelo: string) {
  const ficha = Object.entries(datos)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const sistema = `Eres el asistente de ${empresa ?? 'una empresa'} de seguridad electrónica, redes y domótica en República Dominicana. ${REDACCION[tipo]}
Español dominicano natural y profesional, tratando de "usted". Usa solo los datos dados; no inventes cifras, fechas ni nombres.${tipo !== 'alcance' && empresa ? ` Firma con «${empresa}».` : ''}`;
  return peticion(modelo, sistema, ficha, { type: 'object', properties: { mensaje: texto }, required: ['mensaje'], additionalProperties: false }, 800);
}

export function leerMensaje(datos: unknown): string {
  const t = (datos as { mensaje?: unknown } | null)?.mensaje;
  if (typeof t !== 'string' || !t.trim()) throw new Error('Claude no devolvió un mensaje. Intenta de nuevo.');
  return t.trim();
}

// Entender un pedido dictado ("3 cámaras turret, un gabinete 4u pequeño...") y convertirlo en líneas del inventario.
// Dos caminos que devuelven lo mismo: `entenderLocal` (gratis, sin conexión) y Claude (`armarPeticion` + `leerRespuesta`).
// Módulo puro, sin dependencias, para poder probarlo. El nombre del artículo siempre sale del inventario, nunca de la IA.

export interface ArticuloPedido {
  id: number;
  nombre: string;
  apodos: string[];
  tipo: string;
  extras?: string; // características del equipo: "Con PoE · Soporta 2 discos"
}

export interface LineaPedido {
  texto: string; // lo que se dictó para esta línea
  id: number | null; // artículo del inventario; null = no se encontró
  cantidad: number;
  area: string | null;
  alternativas: number[]; // otros artículos posibles, por si el principal no es el que quería
  confianza: 'alta' | 'media' | 'baja';
}

export interface ResultadoPedido {
  lineas: LineaPedido[];
  notas: string | null;
  cliente: string | null; // "para Juan Pérez": para quién es el levantamiento, si se dijo
}

// ---------- texto ----------

/** minúsculas, sin acentos, solo letras y números separados por un espacio. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "gabinete 4u chico, rack pequeño" -> ["gabinete 4u chico", "rack pequeño"] */
export function separarApodos(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20,
};

// palabras que no ayudan a identificar el artículo
const RELLENO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'unos', 'unas', 'con', 'para', 'por', 'que', 'en', 'al', 'lo', 'e',
  'necesito', 'necesitamos', 'quiero', 'queremos', 'agrega', 'agregar', 'agregame', 'pon', 'poner', 'ponme', 'favor', 'mas', 'hay', 'tambien',
]);

const SINONIMOS: Record<string, string> = { pequeno: 'chico', pequena: 'chico', pequenos: 'chico', pequenas: 'chico', chica: 'chico', chicos: 'chico', chicas: 'chico' };

/** Dos palabras son la misma si son iguales o una es el comienzo de la otra (plurales: cámara / cámaras). */
function mismoToken(a: string, b: string): boolean {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 4 && largo.startsWith(corto);
}

const palabras = (texto: string) =>
  normalizar(texto)
    .replace(/\b(\d+) (canales|canal)\b/g, '$1ch') // "16 canales" = 16CH
    .replace(/\b(\d+) (megapixeles|megapixel|megas)\b/g, '$1mpx')
    .replace(/\bcon poe\b/g, 'poe')
    .replace(/\bsin poe\b/g, 'sinpoe')
    .split(' ')
    .filter(Boolean);
const clave = (texto: string) => palabras(texto).filter((p) => !RELLENO.has(p)).map((p) => SINONIMOS[p] ?? p);
const peso = (t: string) => (/\d/.test(t) ? 2 : 1); // 4u, 4mpx, 305m distinguen más que "cámara"

/** Saca la cantidad del comienzo de un segmento ("necesito 3 cámaras" -> 3) y devuelve las palabras que quedan. */
function cantidadYResto(segmento: string): { cantidad: number; resto: string[] } {
  const todas = palabras(segmento);
  for (let i = 0; i < Math.min(3, todas.length); i++) {
    const p = todas[i];
    if (RELLENO.has(p)) continue;
    const n = /^\d{1,3}$/.test(p) ? Number(p) : NUMEROS[p];
    if (n !== undefined && n >= 1) {
      const resto = [...todas.slice(0, i), ...todas.slice(i + 1)].filter((x) => !RELLENO.has(x)).map((x) => SINONIMOS[x] ?? x);
      return { cantidad: n, resto };
    }
    break; // la primera palabra con significado no es un número: no hay cantidad
  }
  return { cantidad: 1, resto: todas.filter((x) => !RELLENO.has(x)).map((x) => SINONIMOS[x] ?? x) };
}

const SEPARADOR = /[.,;:\n]+|\s+(?:y|además|ademas|también|tambien|luego|después|despues)\s+/i;

// ---------- números dictados ----------

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800,
  ochocientas: 800, novecientos: 900, novecientas: 900,
};
const esPalabraNumero = (w: string) => w in UNIDADES || w in DECENAS || w in CENTENAS || w === 'mil';

/** Lee un número en palabras desde `desde` ("treinta y cinco", "mil doscientos"). Devuelve el valor y cuántas palabras usó. */
function leerNumero(p: string[], desde: number): { valor: number; usadas: number } | null {
  let i = desde;
  // menor de mil: centenas, luego decenas con su "y" unidad, o una unidad
  const menor = (): number | null => {
    let v = 0;
    let usado = false;
    if (p[i] in CENTENAS) {
      v += CENTENAS[p[i]];
      i++;
      usado = true;
    }
    if (p[i] in DECENAS) {
      v += DECENAS[p[i]];
      i++;
      usado = true;
      if (p[i] === 'y' && p[i + 1] in UNIDADES && UNIDADES[p[i + 1]] >= 1 && UNIDADES[p[i + 1]] <= 9) {
        v += UNIDADES[p[i + 1]];
        i += 2;
      }
    } else if (p[i] in UNIDADES) {
      v += UNIDADES[p[i]];
      i++;
      usado = true;
    }
    return usado ? v : null;
  };
  let total = 0;
  const primero = menor();
  if (p[i] === 'mil') {
    total += (primero ?? 1) * 1000;
    i++;
    total += menor() ?? 0;
  } else if (primero !== null) {
    total += primero;
  } else {
    return null;
  }
  return { valor: total, usadas: i - desde };
}

/**
 * Pasa los números dictados en palabras a dígitos: "tres cámaras" -> "3 cámaras", "treinta y cinco" -> "35".
 * Une también el número con su unidad pegada: "cuatro u" -> "4u", "ocho p" -> "8p", "dos mpx" -> "2mpx".
 */
export function numerosEnDigitos(texto: string): string {
  const trozos = texto.match(/\p{L}+|\d+|[^\p{L}\d]+/gu) ?? [];
  const palabra = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let salida = '';
  for (let i = 0; i < trozos.length; i++) {
    const t = trozos[i];
    if (!/^\p{L}/u.test(t) || !esPalabraNumero(palabra(t))) {
      salida += t;
      continue;
    }
    // palabras seguidas (separadas solo por espacios) que podrían formar un solo número
    const palabras: string[] = [];
    const posiciones: number[] = [];
    for (let j = i; j < trozos.length && /^\p{L}/u.test(trozos[j]); j += 2) {
      palabras.push(palabra(trozos[j]));
      posiciones.push(j);
      if (!trozos[j + 1] || !/^\s+$/.test(trozos[j + 1])) break;
    }
    const n = leerNumero(palabras, 0);
    if (!n) {
      salida += t;
      continue;
    }
    salida += String(n.valor);
    i = posiciones[n.usadas - 1];
  }
  return salida.replace(/(\d+)\s+(mpx|mp|tb|gb|ch|va|ah|u|p|w|v|m)(?![\p{L}\d])/giu, '$1$2');
}

// ---------- sin conexión ----------

/** Cuánto de lo dicho (0 a 1) aparece en el artículo, contando sus apodos. 1 = todo. */
function cobertura(resto: string[], tokensArticulo: string[]): number {
  const total = resto.reduce((s, t) => s + peso(t), 0);
  if (total === 0) return 0;
  const hallado = resto.filter((q) => tokensArticulo.some((t) => mismoToken(q, t))).reduce((s, t) => s + peso(t), 0);
  return hallado / total;
}

/** Entiende el pedido comparando palabras con el nombre y los apodos de cada artículo. No usa internet ni IA. */
export function entenderLocal(textoDictado: string, inventario: ArticuloPedido[]): ResultadoPedido {
  const texto = numerosEnDigitos(textoDictado);
  const preparados = inventario.map((a) => ({
    a,
    tokens: [...new Set([...clave(a.nombre), ...a.apodos.flatMap((x) => clave(x)), ...clave(a.extras ?? '')])],
    apodos: a.apodos.map((x) => clave(x).sort().join(' ')),
  }));
  const lineas: LineaPedido[] = [];

  for (const segmento of texto.split(SEPARADOR).map((s) => s.trim()).filter(Boolean)) {
    const { cantidad, resto } = cantidadYResto(segmento);
    if (resto.length === 0) continue;
    const buscada = [...resto].sort().join(' ');

    const puntuados = preparados
      .map((p) => {
        const exacto = p.apodos.includes(buscada);
        const cob = exacto ? 1 : cobertura(resto, p.tokens);
        // desempate: el artículo más específico (con menos palabras de sobra) gana
        return { id: p.a.id, cob, exacto, puntos: cob + (exacto ? 1 : 0) + 0.01 / (1 + p.tokens.length) };
      })
      .filter((p) => p.cob > 0)
      .sort((x, y) => y.puntos - x.puntos);

    const mejor = puntuados[0];
    const seguro = mejor && mejor.cob >= 0.6;
    const empate = seguro && puntuados[1] && puntuados[1].cob >= 0.6 && mejor.puntos - puntuados[1].puntos < 0.05;
    lineas.push({
      texto: segmento,
      id: seguro ? mejor.id : null,
      cantidad,
      area: null,
      alternativas: puntuados
        .slice(seguro ? 1 : 0)
        .filter((p) => p.cob >= (seguro ? 0.5 : 0.34))
        .slice(0, 3)
        .map((p) => p.id),
      confianza: !seguro ? 'baja' : mejor.exacto || (mejor.cob >= 0.99 && !empate) ? 'alta' : 'media',
    });
  }
  return { lineas, notas: null, cliente: null };
}

// ---------- con Claude ----------

export const MODELOS_CLAUDE = [
  { id: 'claude-haiku-5-5', nombre: 'Haiku 5.5', detalle: 'El más barato, menos de 1 centavo por pedido' },
  { id: 'claude-sonnet-5-5', nombre: 'Sonnet 5.5', detalle: 'Recomendado: unos 2 centavos por pedido' },
  { id: 'claude-opus-5-5', nombre: 'Opus 5.5', detalle: 'El más capaz, unos 4 centavos por pedido' },
] as const;

export const MODELO_BASE = 'claude-sonnet-5-5';

const INSTRUCCIONES = `Eres el asistente de una empresa de instalación de seguridad electrónica (cámaras, alarmas, control de acceso), redes y domótica en República Dominicana.
Durante un levantamiento en sitio, el técnico dicta por voz lo que necesita. El texto puede traer errores de dictado. Conviértelo en líneas, cada una apuntando a UN artículo del inventario.

Reglas:
- Usa SOLO los ids del inventario de abajo. Nunca inventes un id ni escribas nombres de artículos.
- Un apodo, o una descripción parecida, identifica el artículo. Si varios encajan, elige el mejor y pon los otros en "alternativas", con confianza "media" o "baja".
- Si nada del inventario corresponde a lo dictado, item_id = null. No fuerces una coincidencia dudosa.
- "cantidad" es la que se dicta; si no se dice, 1. Los servicios (tipo servicio) también están en el inventario, por ejemplo instalaciones por punto.
- "area": si se menciona dónde va ("en la entrada", "bodega"), úsala con la primera letra en mayúscula; si no, null.
- "texto" es el fragmento dictado que originó la línea.
- "notas": una frase corta solo si algo del pedido no se pudo interpretar; si no, null.
- "cliente": el nombre del cliente SOLO si el pedido dice para quién es ("levantamiento para Juan Pérez", "casa de María López"); si no, null.
- Si el pedido trae una FOTO del sitio, propón qué instalar según lo que se ve (accesos, pasillos, fachada, cuarto de equipos): cámaras donde cubran entradas y perímetro, un NVR, accesorios necesarios, y servicios de instalación. "texto" describe dónde y por qué. Prefiere pocas líneas con sentido sobre una lista larga, y usa confianza "media" o "baja" porque es una propuesta que el técnico revisará.

Formato del inventario, una línea por artículo: id | nombre | apodos | tipo | características (si tiene)
Las características (por ejemplo PoE o discos que soporta) ayudan a distinguir equipos parecidos.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto: { type: 'string' },
          item_id: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          cantidad: { type: 'integer' },
          area: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          alternativas: { type: 'array', items: { type: 'integer' } },
        },
        required: ['texto', 'item_id', 'cantidad', 'area', 'confianza', 'alternativas'],
        additionalProperties: false,
      },
    },
    notas: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    cliente: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['lineas', 'notas', 'cliente'],
  additionalProperties: false,
} as const;

/** Cuerpo de la petición a la API de mensajes. Al modelo solo van ids, nombres y apodos: nunca precios, costos ni clientes. */
export function armarPeticion(texto: string, inventario: ArticuloPedido[], modelo: string, areaActual: string | null, imagen?: { base64: string; mime: string }) {
  const lista = [...inventario]
    .sort((a, b) => a.id - b.id) // mismo orden siempre: así el inventario se puede guardar en caché entre pedidos
    .map((a) => `${a.id} | ${a.nombre} | ${a.apodos.join('; ')} | ${a.tipo}${a.extras ? ` | ${a.extras}` : ''}`)
    .join('\n');
  return {
    model: modelo,
    max_tokens: 4096,
    cache_control: { type: 'ephemeral' },
    system: `${INSTRUCCIONES}\n\nINVENTARIO:\n${lista}`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [
      {
        role: 'user',
        content: [
          ...(imagen ? [{ type: 'image', source: { type: 'base64', media_type: imagen.mime, data: imagen.base64 } }] : []),
          {
            type: 'text',
            text: `${areaActual ? `Área en la que está el técnico ahora: ${areaActual}\n\n` : ''}${imagen ? 'Foto del sitio adjunta.\n' : ''}Pedido dictado:\n"""\n${texto.trim() || '(solo la foto)'}\n"""`,
          },
        ],
      },
    ],
  };
}

/** Valida lo que devolvió Claude: ids que no existen pasan a "no encontrado" y las cantidades se corrigen. */
export function leerRespuesta(datos: unknown, idsValidos: Set<number>): ResultadoPedido {
  const d = (datos ?? {}) as { lineas?: unknown; notas?: unknown; cliente?: unknown };
  if (!Array.isArray(d.lineas)) throw new Error('La respuesta de Claude no tiene el formato esperado.');
  const lineas: LineaPedido[] = d.lineas.map((x: Record<string, unknown>) => {
    const id = typeof x.item_id === 'number' && idsValidos.has(x.item_id) ? x.item_id : null;
    const cantidad = Number.isFinite(Number(x.cantidad)) ? Math.max(1, Math.round(Number(x.cantidad))) : 1;
    const area = typeof x.area === 'string' && x.area.trim() ? x.area.trim() : null;
    const alternativas = Array.isArray(x.alternativas)
      ? [...new Set(x.alternativas.filter((a): a is number => typeof a === 'number' && idsValidos.has(a) && a !== id))].slice(0, 3)
      : [];
    const confianza = x.confianza === 'alta' || x.confianza === 'media' || x.confianza === 'baja' ? x.confianza : 'media';
    return { texto: typeof x.texto === 'string' ? x.texto : '', id, cantidad, area, alternativas, confianza: id === null ? 'baja' : confianza };
  });
  return {
    lineas,
    notas: typeof d.notas === 'string' && d.notas.trim() ? d.notas.trim() : null,
    cliente: typeof d.cliente === 'string' && d.cliente.trim().length > 1 ? d.cliente.trim().replace(/\s+/g, ' ') : null,
  };
}

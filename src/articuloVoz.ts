// Crear un artículo del inventario hablando: "agrégame una cámara IP de 4mpx bullet al inventario".
// Claude convierte la frase en las casillas de la nomenclatura (tipo, tecnología, forma, especificación, marca, modelo);
// aquí se arma la petición, se valida lo que devuelve y se convierte en un artículo listo para guardar.
// Lo que dice Claude nunca se guarda solo: primero se le muestra al usuario.
import type { DatosProducto } from './db/catalogo';
import { MARGENES_BASE, precioDesdeCosto } from './dinero';
import { armarNombre, CASILLAS, FAMILIAS, NA, NOMBRES_FAMILIAS, type Partes } from './nomenclatura';

export interface BorradorArticulo {
  familia: string;
  partes: Partes;
  costo_cts: number; // 0 = no se dijo
  stock: number | null;
  apodos: string[];
  descripcion: string | null;
  notas: string | null;
}

/**
 * ¿Lo dictado pide agregar un artículo NUEVO al inventario? Hace falta mencionar el inventario (o el catálogo) como destino:
 * "agrega 3 cámaras del inventario" es un pedido para el levantamiento, no un artículo nuevo.
 */
export function pareceArticuloNuevo(texto: string): boolean {
  const t = texto.toLowerCase();
  const destino = /\b(?:al|en el|a mi|en mi)\s+(?:inventario|cat[aá]logo)\b/.test(t);
  const verbo = /\b(?:agr[eé]g|a[ñn][aá]d|a[ñn]ad|cre[aeé]|crea|registr|guard|met[eé]|pon|dame de alta|da de alta)\w*/.test(t);
  return (destino && verbo) || /\b(?:nuevo art[ií]culo|art[ií]culo nuevo)\b/.test(t);
}

const lista = (xs: string[]) => (xs.length ? xs.join(', ') : '—');

export function descripcionFamilias(): string {
  return NOMBRES_FAMILIAS.map((n) => {
    const f = FAMILIAS[n];
    const espec = Object.entries(f.especificaciones)
      .filter(([tipo, v]) => tipo !== '*' && v.length)
      .map(([tipo, v]) => `${tipo}: ${v.join('/')}`)
      .join('; ');
    return `- ${n}${f.servicio ? ' (servicios)' : ''}
  tipos: ${lista(f.tipos)}
  tecnologías: ${lista(f.tecnologias)}
  formas / montaje: ${lista(f.formas)}
  especificaciones: ${espec || '—'}
  marcas: ${lista(f.marcas)}`;
  }).join('\n');
}

const INSTRUCCIONES = `Eres el asistente de una empresa de seguridad electrónica, redes y domótica en República Dominicana.
El dueño dicta por voz que quiere agregar UN artículo nuevo a su inventario. El texto puede traer errores de dictado.
Conviértelo en las casillas del nombre estándar, que siempre va en este orden: tipo, tecnología, forma, especificación, marca, modelo.

Reglas:
- Elige la familia (categoría) que corresponda.
- Para cada casilla usa el valor de las listas de esa familia cuando coincida, escrito exactamente igual que en la lista ("4 megapíxeles" o "4 mpx" es "4MPX"; "8 canales" es "8CH").
- Si dijo un valor que no está en las listas, escríbelo tal cual lo dijo, con la primera letra en mayúscula.
- Si una casilla NO se mencionó o no aplica, pon "N/A". Nunca inventes una marca ni un modelo.
- "costo": solo si el dueño dice cuánto le COSTÓ o su costo, en pesos dominicanos, como número. Un precio de venta no es el costo: en ese caso null.
- "existencia": cuántas unidades dice tener; si no lo dice, null.
- "apodos": hasta 3 nombres cortos con los que lo llamaría ("cámara bullet 4"); lista vacía si no hay.
- "descripcion": solo si dictó una descripción; si no, null.
- "notas": una frase corta si algo no se pudo interpretar; si no, null.

Familias y sus opciones:
${descripcionFamilias()}`;

const texto = { type: 'string' } as const;
/** Las casillas del nombre estándar tal como se piden a Claude (también las usa la lectura de pedidos en PDF). */
export const CASILLAS_ESQUEMA = {
  familia: { type: 'string', enum: NOMBRES_FAMILIAS },
  tipo: texto,
  tecnologia: texto,
  forma: texto,
  especificacion: texto,
  marca: texto,
  modelo: texto,
} as const;
const ESQUEMA = {
  type: 'object',
  properties: {
    ...CASILLAS_ESQUEMA,
    costo: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    existencia: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    apodos: { type: 'array', items: texto },
    descripcion: { anyOf: [texto, { type: 'null' }] },
    notas: { anyOf: [texto, { type: 'null' }] },
  },
  required: ['familia', 'tipo', 'tecnologia', 'forma', 'especificacion', 'marca', 'modelo', 'costo', 'existencia', 'apodos', 'descripcion', 'notas'],
  additionalProperties: false,
} as const;

/** Cuerpo de la petición a la API de mensajes. Solo va lo dictado: ningún dato de clientes ni del inventario. */
export function armarPeticionArticulo(dictado: string, modelo: string) {
  return {
    model: modelo,
    max_tokens: 1024,
    system: INSTRUCCIONES,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [{ role: 'user', content: `Pedido dictado:\n"""\n${dictado.trim()}\n"""` }],
  };
}

const limpio = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : NA);
const esNA = (v: string) => ['N/A', 'NA', 'NO APLICA'].includes(v.trim().toUpperCase());

/** Valida lo que devolvió Claude. Lanza un Error con un mensaje listo para mostrar si no se puede armar un artículo. */
export function leerArticulo(datos: unknown): BorradorArticulo {
  const d = (datos ?? {}) as Record<string, unknown>;
  const familia = typeof d.familia === 'string' && FAMILIAS[d.familia] ? d.familia : null;
  if (!familia) throw new Error('No pude saber de qué tipo de equipo es (CCTV, Alarma, Redes...). Dilo con un poco más de detalle.');
  const partes = Object.fromEntries(CASILLAS.map((c) => [c, limpio(d[c])])) as Partes;
  if (esNA(partes.tipo)) throw new Error('No entendí qué artículo es (por ejemplo cámara, NVR, sensor, router). Dilo de nuevo.');
  const costo = typeof d.costo === 'number' && Number.isFinite(d.costo) && d.costo > 0 && d.costo < 10_000_000 ? Math.round(d.costo * 100) : 0;
  const existencia = typeof d.existencia === 'number' && Number.isInteger(d.existencia) && d.existencia >= 0 ? d.existencia : null;
  const apodos = Array.isArray(d.apodos)
    ? [...new Set(d.apodos.filter((a): a is string => typeof a === 'string' && a.trim().length > 1).map((a) => a.trim().toLowerCase()))].slice(0, 3)
    : [];
  return {
    familia,
    partes,
    costo_cts: costo,
    stock: existencia,
    apodos,
    descripcion: typeof d.descripcion === 'string' && d.descripcion.trim() ? d.descripcion.trim() : null,
    notas: typeof d.notas === 'string' && d.notas.trim() ? d.notas.trim() : null,
  };
}

/** El artículo tal como se guardaría en el inventario: el mismo resultado que llenar el formulario a mano. */
export function aDatosProducto(b: BorradorArticulo, margenes: readonly [number, number, number] = MARGENES_BASE): DatosProducto {
  const nombre = armarNombre(b.partes);
  if (!nombre) throw new Error('Falta decidir alguna característica del artículo.');
  const servicio = !!FAMILIAS[b.familia].servicio;
  const precios =
    b.costo_cts > 0
      ? {
          precio_cts: precioDesdeCosto(b.costo_cts, margenes[0]),
          costo_cts: b.costo_cts,
          margen1_pct: margenes[0] as number | null,
          margen2_pct: margenes[1] as number | null,
          margen3_pct: margenes[2] as number | null,
        }
      : { precio_cts: 0, costo_cts: 0, margen1_pct: null, margen2_pct: null, margen3_pct: null };
  const opcional = (v: string) => (esNA(v) ? null : v.trim());
  return {
    nombre,
    tipo: servicio ? 'servicio' : 'equipo',
    categoria: b.familia,
    stock: servicio ? null : b.stock,
    descripcion: b.descripcion,
    apodos: b.apodos.join(', ') || null,
    atributos: null,
    ...precios,
    f_tipo: b.partes.tipo.trim(),
    f_tecnologia: opcional(b.partes.tecnologia),
    f_forma: opcional(b.partes.forma),
    f_especificacion: opcional(b.partes.especificacion),
    f_marca: opcional(b.partes.marca),
    f_modelo: opcional(b.partes.modelo),
  };
}

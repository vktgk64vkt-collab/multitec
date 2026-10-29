// Pedido de un suplidor (PDF o foto) -> artículos del inventario. Claude lee el documento y arma cada artículo con la nomenclatura
// estándar (tipo, tecnología, forma, especificación, marca, modelo), una descripción breve y el costo. Aquí se valida lo que
// devuelve y se decide, sin repetir artículos, qué es nuevo y qué ya existe (y si su costo sube). Nada se guarda sin que
// el usuario lo confirme. Módulo puro, sin red ni base de datos.
import { aDatosProducto, CASILLAS_ESQUEMA, descripcionFamilias, leerArticulo, type BorradorArticulo } from './articuloVoz';
import { debeSubirCosto, type DatosProducto, type Producto } from './db/catalogo';
import { bloqueImagen } from './ia';
import { precioDesdeCosto } from './dinero';
import { armarNombre, NA } from './nomenclatura';
import { normalizar } from './pedido';

/** Lo que se le manda a Claude para que lo lea: un PDF o una foto del pedido. */
export type Fuente = { tipo: 'pdf'; base64: string } | { tipo: 'imagen'; base64: string; mime: string };

/** La API acepta PDF de hasta 32 MB en total; en base64 son ~1,37 veces más caracteres. */
export const MAX_BASE64_PDF = 30_000_000;

export interface LineaPedido {
  texto: string; // la línea tal como aparece en el PDF
  borrador: BorradorArticulo;
  cantidad: number;
  costo: number; // por unidad, en la moneda del PDF; 0 = no se leyó
}
export interface PedidoLeido {
  proveedor: string | null;
  moneda: string; // 'DOP' o la que traiga el PDF (USD...)
  lineas: LineaPedido[];
  ilegibles: string[]; // líneas que no se pudieron convertir en un artículo
  notas: string | null;
}

const texto = { type: 'string' } as const;
const nulo = (t: object) => ({ anyOf: [t, { type: 'null' }] });

const INSTRUCCIONES = `Eres el asistente de una empresa de seguridad electrónica, redes y domótica en República Dominicana.
El documento (PDF o foto) es un pedido, factura o cotización de un suplidor (proveedor). Extrae CADA artículo y conviértelo en las casillas del nombre estándar, que siempre va en este orden: tipo, tecnología, forma, especificación, marca, modelo.

Reglas:
- Elige la familia (categoría) que corresponda.
- Para cada casilla usa el valor de las listas de esa familia cuando coincida, escrito exactamente igual ("4 megapíxeles" o "4MP" es "4MPX"; "8 canales" es "8CH").
- Si el documento trae un valor que no está en las listas, escríbelo tal cual, con la primera letra en mayúscula.
- Si una casilla NO aparece o no aplica, pon "N/A". Nunca inventes una marca ni un modelo.
- "modelo": el código del fabricante tal como aparece (por ejemplo DS-2CD2143G2-I). No uses el código interno del suplidor.
- "descripcion": una frase breve (máximo 100 caracteres) con lo que dice el PDF sobre el artículo (por ejemplo "Visión nocturna 30 m, IP67"). No inventes características; si no hay nada útil, null.
- "texto": la línea tal como aparece en el PDF.
- "cantidad": unidades pedidas (entero, mínimo 1).
- "costo_unitario": lo que cuesta UNA unidad, antes de ITBIS/impuesto si el PDF lo separa, ya con el descuento de la línea si lo tiene. Si solo ves el total de la línea, divide entre la cantidad. Si no se lee, null.
- "moneda": la moneda de los precios del PDF en código (DOP para pesos dominicanos o RD$, USD para dólares).
- "proveedor": el nombre del suplidor si aparece; si no, null.
- "notas": una frase corta si algo no se leyó bien; si no, null.
- Ignora subtotales, impuestos, envío, descuentos globales y cualquier dato que no sea un artículo.
- Un mismo artículo repetido en varias líneas se devuelve una sola vez, con las cantidades sumadas.

Familias y sus opciones:
${descripcionFamilias()}`;

const ESQUEMA = {
  type: 'object',
  properties: {
    proveedor: nulo(texto),
    moneda: texto,
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...CASILLAS_ESQUEMA,
          texto,
          descripcion: nulo(texto),
          cantidad: { type: 'integer' },
          costo_unitario: nulo({ type: 'number' }),
        },
        required: ['familia', 'tipo', 'tecnologia', 'forma', 'especificacion', 'marca', 'modelo', 'texto', 'descripcion', 'cantidad', 'costo_unitario'],
        additionalProperties: false,
      },
    },
    notas: nulo(texto),
  },
  required: ['proveedor', 'moneda', 'lineas', 'notas'],
  additionalProperties: false,
} as const;

export function armarPeticionPedidoPdf(fuente: Fuente, modelo: string) {
  return {
    model: modelo,
    max_tokens: 16000,
    system: INSTRUCCIONES,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [
      {
        role: 'user',
        content: [
          fuente.tipo === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fuente.base64 } } : bloqueImagen(fuente),
          { type: 'text', text: 'Pedido del suplidor. Extrae los artículos.' },
        ],
      },
    ],
  };
}

/** Valida lo que devolvió Claude. Lanza un Error con un mensaje listo para mostrar si no hay forma de usarlo. */
export function leerPedidoPdf(datos: unknown): PedidoLeido {
  const d = (datos ?? {}) as { proveedor?: unknown; moneda?: unknown; lineas?: unknown; notas?: unknown };
  if (!Array.isArray(d.lineas)) throw new Error('La respuesta de Claude no tiene el formato esperado.');
  const lineas: LineaPedido[] = [];
  const ilegibles: string[] = [];
  for (const x of d.lineas as Record<string, unknown>[]) {
    const original = typeof x.texto === 'string' ? x.texto.trim() : '';
    try {
      const cantidad = Number.isFinite(Number(x.cantidad)) ? Math.max(1, Math.round(Number(x.cantidad))) : 1;
      const costo = typeof x.costo_unitario === 'number' && Number.isFinite(x.costo_unitario) && x.costo_unitario > 0 && x.costo_unitario < 100_000_000 ? x.costo_unitario : 0;
      // la validación de las casillas es la misma de crear un artículo hablando
      const borrador = leerArticulo({ ...x, costo: null, existencia: null, apodos: [], notas: null });
      lineas.push({ texto: original, borrador, cantidad, costo });
    } catch {
      if (original) ilegibles.push(original);
    }
  }
  const moneda = typeof d.moneda === 'string' && d.moneda.trim() ? d.moneda.trim().toUpperCase() : 'DOP';
  return {
    proveedor: typeof d.proveedor === 'string' && d.proveedor.trim() ? d.proveedor.trim() : null,
    moneda: ['RD$', 'DOP', 'RD', 'RDS'].includes(moneda) ? 'DOP' : moneda,
    lineas,
    ilegibles,
    notas: typeof d.notas === 'string' && d.notas.trim() ? d.notas.trim() : null,
  };
}

// ---------- qué es nuevo y qué ya existe ----------

export interface PlanLinea {
  clave: number;
  texto: string;
  nombre: string;
  borrador: BorradorArticulo;
  cantidad: number;
  costo_cts: number; // por unidad, en pesos; 0 = el PDF no lo trae
  existente: Producto | null;
  sube: boolean; // existente: el costo del pedido es mayor y reemplaza al registrado
  precio_cts: number | null; // existente que sube: su nuevo precio 1 (null = no cambia)
}

const claro = (v: string | null | undefined) => (v ? normalizar(v) : '');
const sinNA = (v: string) => (v.trim().toUpperCase() === NA ? '' : claro(v));

/** El artículo del inventario que es el mismo del pedido: mismo nombre estándar, o mismo modelo del fabricante (y marca, si ambos la traen). */
export function buscarExistente(b: BorradorArticulo, inventario: Producto[]): Producto | null {
  const nombre = armarNombre(b.partes);
  const porNombre = nombre ? inventario.find((p) => claro(p.nombre) === claro(nombre)) : undefined;
  if (porNombre) return porNombre;
  const modelo = sinNA(b.partes.modelo);
  if (!modelo) return null;
  const marca = sinNA(b.partes.marca);
  return inventario.find((p) => claro(p.f_modelo) === modelo && (!marca || !claro(p.f_marca) || claro(p.f_marca) === marca)) ?? null;
}

/**
 * Convierte las líneas del pedido en un plan: las que se repiten (mismo artículo) se juntan sumando cantidades y
 * quedándose con el costo mayor. `tasa` pasa los costos a pesos (1 si el PDF ya está en pesos).
 */
export function planificarPedido(lineas: LineaPedido[], inventario: Producto[], tasa = 1): PlanLinea[] {
  const juntas = new Map<string, PlanLinea>();
  for (const l of lineas) {
    const nombre = armarNombre(l.borrador.partes);
    if (!nombre) continue;
    const costo = Math.round(l.costo * tasa * 100);
    const clave = claro(nombre);
    const previa = juntas.get(clave);
    if (previa) {
      previa.cantidad += l.cantidad;
      previa.costo_cts = Math.max(previa.costo_cts, costo);
      continue;
    }
    juntas.set(clave, { clave: 0, texto: l.texto, nombre, borrador: l.borrador, cantidad: l.cantidad, costo_cts: costo, existente: null, sube: false, precio_cts: null });
  }
  const plan: PlanLinea[] = [];
  for (const p of juntas.values()) {
    const existente = buscarExistente(p.borrador, inventario);
    // dos líneas del pedido con nombres distintos pueden ser el mismo artículo del inventario (mismo modelo): se juntan
    const otra = existente ? plan.find((x) => x.existente?.id === existente.id) : undefined;
    if (otra) {
      otra.cantidad += p.cantidad;
      otra.costo_cts = Math.max(otra.costo_cts, p.costo_cts);
    } else {
      plan.push({ ...p, existente });
    }
  }
  for (const p of plan) {
    if (!p.existente) continue;
    p.sube = debeSubirCosto(p.existente.costo_cts, p.costo_cts);
    p.precio_cts = p.sube && p.existente.margen1_pct !== null ? precioDesdeCosto(p.costo_cts, p.existente.margen1_pct) : null;
  }
  plan.forEach((p, i) => (p.clave = i));
  return plan;
}

/** El artículo nuevo tal como se guardaría: nombre estándar, descripción breve, costo y precios con los márgenes del negocio. */
export function datosArticuloNuevo(p: PlanLinea, sumarStock: boolean, margenes?: readonly [number, number, number]): DatosProducto {
  return aDatosProducto({ ...p.borrador, costo_cts: p.costo_cts, stock: sumarStock ? p.cantidad : null }, margenes);
}

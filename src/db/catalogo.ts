import type { SQLiteDatabase } from 'expo-sqlite';

import { ITBIS_PCT, precioDesdeCosto } from '../dinero';
import { prefijoCodigo } from '../nomenclatura';

export const TIPOS_ITEM = ['equipo', 'servicio'] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];

// La tabla se llama `catalogo` por historia; en la app es el inventario.
export interface Producto {
  id: number;
  nombre: string;
  precio_cts: number;
  tipo: TipoItem;
  categoria: string | null;
  costo_cts: number;
  stock: number | null; // null = no se controla el stock (servicios, material sin conteo)
  margen1_pct: number | null; // null = artículo de precio fijo (sin cálculo desde el costo)
  margen2_pct: number | null;
  margen3_pct: number | null;
  // nomenclatura: null en f_tipo = artículo anterior con nombre libre; null en las demás = N/A
  f_tipo: string | null;
  f_tecnologia: string | null;
  f_forma: string | null;
  f_especificacion: string | null;
  f_marca: string | null;
  f_modelo: string | null;
  codigo: string | null; // único, automático: CCTV-0001 (null solo en datos muy anteriores)
  descripcion: string | null; // breve; se copia a la cotización y a la factura
  atributos: string | null; // características según el tipo (JSON): {"poe":"Con PoE","discos":"2"}
  apodos: string | null; // nombres cortos separados por coma, para encontrarlo al dictar ("gabinete 4u chico, rack chico")
  cobro_auto: string | null; // servicio que se cobra solo: 'camara', 'punto' o 'alarma' (ver cobroAuto.ts); null = cobro normal
  cobro_param: string | null; // 'punto': tipos que cuentan como punto; 'alarma': el porcentaje
}

// cobro_auto / cobro_param sin indicar (undefined) = no se tocan al actualizar
export type DatosProducto = Omit<Producto, 'id' | 'codigo' | 'cobro_auto' | 'cobro_param'> & { cobro_auto?: string | null; cobro_param?: string | null };

export function listarCatalogo(db: SQLiteDatabase, busqueda = '') {
  return db.getAllAsync<Producto>(
    'SELECT * FROM catalogo WHERE nombre LIKE ?1 OR categoria LIKE ?1 OR codigo LIKE ?1 OR apodos LIKE ?1 ORDER BY tipo, nombre COLLATE NOCASE',
    `%${busqueda.trim()}%`
  );
}

/** Siguiente código libre de la familia: PREFIJO-0001, PREFIJO-0002... (el código nunca se reutiliza ni cambia). */
async function siguienteCodigo(db: SQLiteDatabase, familia: string | null) {
  const prefijo = prefijoCodigo(familia);
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COALESCE(MAX(CAST(substr(codigo, length(?1) + 2) AS INTEGER)), 0) AS n FROM catalogo WHERE codigo LIKE ?1 || '-%'",
    prefijo
  );
  return `${prefijo}-${String((r?.n ?? 0) + 1).padStart(4, '0')}`;
}

export function obtenerProducto(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Producto>('SELECT * FROM catalogo WHERE id = ?', id);
}

export async function crearProducto(db: SQLiteDatabase, d: DatosProducto) {
  const codigo = await siguienteCodigo(db, d.categoria);
  return db.runAsync(
    `INSERT INTO catalogo (nombre, precio_cts, tipo, categoria, costo_cts, stock, margen1_pct, margen2_pct, margen3_pct,
       f_tipo, f_tecnologia, f_forma, f_especificacion, f_marca, f_modelo, descripcion, apodos, atributos, codigo, cobro_auto, cobro_param)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.nombre, d.precio_cts, d.tipo, d.categoria, d.costo_cts, d.stock, d.margen1_pct, d.margen2_pct, d.margen3_pct,
    d.f_tipo, d.f_tecnologia, d.f_forma, d.f_especificacion, d.f_marca, d.f_modelo, d.descripcion, d.apodos, d.atributos, codigo,
    d.cobro_auto ?? null, d.cobro_param ?? null
  );
}

export async function actualizarProducto(db: SQLiteDatabase, id: number, d: DatosProducto) {
  await db.runAsync(
    `UPDATE catalogo SET nombre = ?, precio_cts = ?, tipo = ?, categoria = ?, costo_cts = ?, stock = ?, margen1_pct = ?, margen2_pct = ?, margen3_pct = ?,
       f_tipo = ?, f_tecnologia = ?, f_forma = ?, f_especificacion = ?, f_marca = ?, f_modelo = ?, descripcion = ?, apodos = ?, atributos = ? WHERE id = ?`,
    d.nombre, d.precio_cts, d.tipo, d.categoria, d.costo_cts, d.stock, d.margen1_pct, d.margen2_pct, d.margen3_pct,
    d.f_tipo, d.f_tecnologia, d.f_forma, d.f_especificacion, d.f_marca, d.f_modelo, d.descripcion, d.apodos, d.atributos, id
  );
  if (d.cobro_auto !== undefined) await db.runAsync('UPDATE catalogo SET cobro_auto = ?, cobro_param = ? WHERE id = ?', d.cobro_auto, d.cobro_param ?? null, id);
}

/** El artículo ya existía: suma la cantidad que entra al stock (si no llevaba conteo, empieza con esa cantidad). */
export function sumarStock(db: SQLiteDatabase, id: number, cantidad: number) {
  return db.runAsync('UPDATE catalogo SET stock = COALESCE(stock, 0) + ? WHERE id = ?', cantidad, id);
}

/**
 * Compra a un proveedor: suma lo que entra al stock (los servicios no llevan stock) y, si se conoce el costo, lo actualiza
 * y recalcula el precio 1 con el margen del artículo. Un artículo de precio fijo (sin margen) conserva su precio.
 */
export async function registrarCompra(db: SQLiteDatabase, id: number, cantidad: number, costoCts: number) {
  const p = await obtenerProducto(db, id);
  if (!p) return;
  const precio = costoCts > 0 && p.margen1_pct !== null ? precioDesdeCosto(costoCts, p.margen1_pct) : p.precio_cts;
  await db.runAsync(
    `UPDATE catalogo SET costo_cts = CASE WHEN ? > 0 THEN ? ELSE costo_cts END, precio_cts = ?,
       stock = CASE WHEN tipo = 'servicio' THEN stock ELSE COALESCE(stock, 0) + ? END WHERE id = ?`,
    costoCts, costoCts, precio, cantidad, id
  );
}

/** Regla del costo en los pedidos de proveedor: solo se reemplaza si el nuevo es mayor (o si el artículo aún no tenía costo). */
export const debeSubirCosto = (actualCts: number, nuevoCts: number) => nuevoCts > 0 && nuevoCts > actualCts;

/**
 * Pedido de un suplidor para un artículo que ya existe. Si el costo del pedido es mayor, lo actualiza y recalcula el precio 1 con
 * los márgenes del artículo; si es menor o igual, el costo registrado se queda. Opcionalmente suma lo pedido al stock.
 */
export async function aplicarPedidoProveedor(db: SQLiteDatabase, id: number, cantidad: number, costoCts: number, sumarStock: boolean) {
  const p = await obtenerProducto(db, id);
  if (!p) return;
  const sube = debeSubirCosto(p.costo_cts, costoCts);
  const precio = sube && p.margen1_pct !== null ? precioDesdeCosto(costoCts, p.margen1_pct) : p.precio_cts;
  await db.runAsync(
    `UPDATE catalogo SET costo_cts = ?, precio_cts = ?,
       stock = CASE WHEN tipo = 'servicio' OR ? = 0 THEN stock ELSE COALESCE(stock, 0) + ? END WHERE id = ?`,
    sube ? costoCts : p.costo_cts, precio, sumarStock ? 1 : 0, cantidad, id
  );
}

/**
 * Pone estos márgenes a todos los artículos con precio calculado (los de precio fijo no se tocan) y recalcula su precio 1.
 * Las cotizaciones ya hechas conservan los precios con que se cotizaron. Devuelve cuántos artículos cambiaron.
 */
export async function aplicarMargenesATodo(db: SQLiteDatabase, m: readonly [number, number, number]) {
  const r = await db.runAsync(
    `UPDATE catalogo SET margen1_pct = ?, margen2_pct = ?, margen3_pct = ?,
       precio_cts = CASE WHEN costo_cts > 0 THEN CAST(ROUND(costo_cts * (1 + ? / 100.0) * (1 + ? / 100.0)) AS INTEGER) ELSE precio_cts END
     WHERE margen1_pct IS NOT NULL`,
    m[0], m[1], m[2], m[0], ITBIS_PCT
  );
  return r.changes;
}

export function eliminarProducto(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM catalogo WHERE id = ?', id);
}

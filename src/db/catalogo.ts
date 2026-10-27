import type { SQLiteDatabase } from 'expo-sqlite';

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
}

export type DatosProducto = Omit<Producto, 'id'>;

export function listarCatalogo(db: SQLiteDatabase, busqueda = '') {
  return db.getAllAsync<Producto>(
    'SELECT * FROM catalogo WHERE nombre LIKE ?1 OR categoria LIKE ?1 ORDER BY tipo, nombre COLLATE NOCASE',
    `%${busqueda.trim()}%`
  );
}

export function crearProducto(db: SQLiteDatabase, d: DatosProducto) {
  return db.runAsync(
    `INSERT INTO catalogo (nombre, precio_cts, tipo, categoria, costo_cts, stock, margen1_pct, margen2_pct, margen3_pct,
       f_tipo, f_tecnologia, f_forma, f_especificacion, f_marca, f_modelo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.nombre, d.precio_cts, d.tipo, d.categoria, d.costo_cts, d.stock, d.margen1_pct, d.margen2_pct, d.margen3_pct,
    d.f_tipo, d.f_tecnologia, d.f_forma, d.f_especificacion, d.f_marca, d.f_modelo
  );
}

export function actualizarProducto(db: SQLiteDatabase, id: number, d: DatosProducto) {
  return db.runAsync(
    `UPDATE catalogo SET nombre = ?, precio_cts = ?, tipo = ?, categoria = ?, costo_cts = ?, stock = ?, margen1_pct = ?, margen2_pct = ?, margen3_pct = ?,
       f_tipo = ?, f_tecnologia = ?, f_forma = ?, f_especificacion = ?, f_marca = ?, f_modelo = ? WHERE id = ?`,
    d.nombre, d.precio_cts, d.tipo, d.categoria, d.costo_cts, d.stock, d.margen1_pct, d.margen2_pct, d.margen3_pct,
    d.f_tipo, d.f_tecnologia, d.f_forma, d.f_especificacion, d.f_marca, d.f_modelo, id
  );
}

export function eliminarProducto(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM catalogo WHERE id = ?', id);
}

import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION_ACTUAL = 7;

export async function migrarBaseDeDatos(db: SQLiteDatabase) {
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = fila?.user_version ?? 0;
  if (version >= VERSION_ACTUAL) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        empresa TEXT,
        telefono TEXT,
        correo TEXT,
        direccion TEXT,
        id_fiscal TEXT,
        notas TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes (nombre COLLATE NOCASE);
    `);
  }

  if (version < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS proyectos (
        id INTEGER PRIMARY KEY NOT NULL,
        cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'levantamiento',
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  if (version < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS levantamiento (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
        area TEXT NOT NULL,
        equipo TEXT NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        notas TEXT,
        foto_uri TEXT
      );
    `);
  }

  if (version < 4) {
    // precios en centavos (entero) para no acumular errores de punto flotante
    await db.execAsync(`
      ALTER TABLE proyectos ADD COLUMN impuesto_pct REAL NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS cotizacion_items (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
        descripcion TEXT NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_cts INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  if (version < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS bitacora (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  if (version < 6) {
    // República Dominicana: ITBIS 18 %. Los proyectos existentes en 0 se ajustan.
    await db.execAsync(`
      UPDATE proyectos SET impuesto_pct = 18 WHERE impuesto_pct = 0;
      CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL UNIQUE REFERENCES proyectos (id) ON DELETE CASCADE,
        ncf TEXT NOT NULL,
        subtotal_cts INTEGER NOT NULL,
        impuesto_cts INTEGER NOT NULL,
        total_cts INTEGER NOT NULL,
        pagada INTEGER NOT NULL DEFAULT 0,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  if (version < 7) {
    // líneas congeladas de la factura (la cotización puede seguir editándose)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS factura_items (
        id INTEGER PRIMARY KEY NOT NULL,
        factura_id INTEGER NOT NULL REFERENCES facturas (id) ON DELETE CASCADE,
        descripcion TEXT NOT NULL,
        cantidad INTEGER NOT NULL,
        precio_cts INTEGER NOT NULL
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${VERSION_ACTUAL}`);
}

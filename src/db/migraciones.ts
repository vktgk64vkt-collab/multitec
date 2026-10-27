import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION_ACTUAL = 12;

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

  if (version < 8) {
    // pagos parciales; las facturas ya marcadas como pagadas se convierten en un pago por el total
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY NOT NULL,
        factura_id INTEGER NOT NULL REFERENCES facturas (id) ON DELETE CASCADE,
        monto_cts INTEGER NOT NULL,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO pagos (factura_id, monto_cts) SELECT id, total_cts FROM facturas WHERE pagada = 1;
    `);
  }

  if (version < 9) {
    // descuento por línea, vencimiento de factura (30 días a las existentes), catálogo y perfil del negocio
    await db.execAsync(`
      ALTER TABLE cotizacion_items ADD COLUMN descuento_pct REAL NOT NULL DEFAULT 0;
      ALTER TABLE factura_items ADD COLUMN descuento_pct REAL NOT NULL DEFAULT 0;
      ALTER TABLE facturas ADD COLUMN vence TEXT;
      UPDATE facturas SET vence = date(creado_en, '+30 days');
      CREATE TABLE IF NOT EXISTS catalogo (
        id INTEGER PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        precio_cts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS negocio (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        nombre TEXT, rnc TEXT, telefono TEXT, correo TEXT, direccion TEXT, logo_uri TEXT
      );
      INSERT OR IGNORE INTO negocio (id) VALUES (1);
    `);
  }

  if (version < 10) {
    // inventario (el antiguo catálogo) con tipo/categoría/costo/stock; las partidas del levantamiento
    // se enlazan a su línea de cotización (partida_id) y al producto (item_id)
    await db.execAsync(`
      ALTER TABLE catalogo ADD COLUMN tipo TEXT NOT NULL DEFAULT 'equipo';
      ALTER TABLE catalogo ADD COLUMN categoria TEXT;
      ALTER TABLE catalogo ADD COLUMN costo_cts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE catalogo ADD COLUMN stock INTEGER;
      ALTER TABLE levantamiento ADD COLUMN item_id INTEGER;
      ALTER TABLE cotizacion_items ADD COLUMN tipo TEXT NOT NULL DEFAULT 'equipo';
      ALTER TABLE cotizacion_items ADD COLUMN costo_cts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cotizacion_items ADD COLUMN item_id INTEGER;
      ALTER TABLE cotizacion_items ADD COLUMN partida_id INTEGER;
      ALTER TABLE factura_items ADD COLUMN tipo TEXT NOT NULL DEFAULT 'equipo';
      ALTER TABLE proyectos ADD COLUMN condiciones TEXT;
    `);
  }

  if (version < 11) {
    // 3 precios por artículo (margen % sobre el costo, ITBIS incluido). Los artículos anteriores no tienen
    // márgenes (NULL) y siguen con su precio fijo. Los proyectos anteriores siguen sumando el ITBIS aparte.
    await db.execAsync(`
      ALTER TABLE catalogo ADD COLUMN margen1_pct REAL;
      ALTER TABLE catalogo ADD COLUMN margen2_pct REAL;
      ALTER TABLE catalogo ADD COLUMN margen3_pct REAL;
      ALTER TABLE proyectos ADD COLUMN precios_con_itbis INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE proyectos ADD COLUMN nivel_precio INTEGER NOT NULL DEFAULT 1;
    `);
  }

  if (version < 12) {
    // nomenclatura estándar del inventario: tipo, tecnología, forma, especificación, marca y modelo.
    // NULL en todas = artículo anterior con nombre libre; "N/A" se guarda como NULL con f_tipo presente.
    await db.execAsync(`
      ALTER TABLE catalogo ADD COLUMN f_tipo TEXT;
      ALTER TABLE catalogo ADD COLUMN f_tecnologia TEXT;
      ALTER TABLE catalogo ADD COLUMN f_forma TEXT;
      ALTER TABLE catalogo ADD COLUMN f_especificacion TEXT;
      ALTER TABLE catalogo ADD COLUMN f_marca TEXT;
      ALTER TABLE catalogo ADD COLUMN f_modelo TEXT;
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${VERSION_ACTUAL}`);
}

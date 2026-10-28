import type { SQLiteDatabase } from 'expo-sqlite';

import { CODIGOS_SQL } from '../nomenclatura';

export const VERSION_ACTUAL = 24;

// Marca las partidas que ya tienen su línea en la cotización (datos anteriores a la suma de líneas repetidas).
export const EN_COTIZACION_SQL = 'UPDATE levantamiento SET en_cotizacion = 1 WHERE id IN (SELECT partida_id FROM cotizacion_items WHERE partida_id IS NOT NULL)';

// Un registro es "proyecto" cuando está aprobado; hasta entonces es una cotización. Los que ya iban avanzados
// (ejecución, factura o cerrados) quedan como proyectos; los demás vuelven a ser cotizaciones por responder.
export const APROBADOS_SQL = `UPDATE proyectos SET aprobado_en = creado_en, cot_estado = 'aprobada'
  WHERE aprobado_en IS NULL AND (estado IN ('en ejecución', 'facturado', 'cerrado') OR ejecucion_iniciada_en IS NOT NULL
    OR id IN (SELECT proyecto_id FROM facturas))`;

export async function migrarBaseDeDatos(db: SQLiteDatabase) {
  // por conexión y fuera de la transacción: sin foreign_keys el ON DELETE CASCADE del esquema no hace nada
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = fila?.user_version ?? 0;
  if (version >= VERSION_ACTUAL) return;
  // todo o nada: si la app se cierra a medias, no queda a medio migrar (repetir un ALTER fallaría para siempre)
  await db.withTransactionAsync(() => aplicar(db, version));
}

async function aplicar(db: SQLiteDatabase, version: number) {

  if (version < 1) {
    await db.execAsync(`
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

  if (version < 13) {
    // código único por artículo, descripción breve (se copia a cotización y factura) y texto de la propuesta
    await db.execAsync(`
      ALTER TABLE catalogo ADD COLUMN codigo TEXT;
      ALTER TABLE catalogo ADD COLUMN descripcion TEXT;
      ALTER TABLE cotizacion_items ADD COLUMN detalle TEXT;
      ALTER TABLE factura_items ADD COLUMN detalle TEXT;
      ALTER TABLE proyectos ADD COLUMN propuesta_intro TEXT;
    `);
    await db.execAsync(CODIGOS_SQL);
    await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_codigo ON catalogo (codigo)');
  }

  if (version < 14) {
    // facturas anuladas (el NCF queda usado) y NCF único: solo se crea el índice si no hay repetidos ya guardados
    await db.execAsync(`
      ALTER TABLE facturas ADD COLUMN anulada INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE factura_items ADD COLUMN item_id INTEGER;
    `);
    const repetido = await db.getFirstAsync('SELECT 1 FROM facturas GROUP BY ncf HAVING COUNT(*) > 1');
    if (!repetido) await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_ncf ON facturas (ncf)');
  }

  if (version < 15) {
    // identidad de la empresa del usuario en sus documentos: lema del pie y color de marca
    await db.execAsync(`
      ALTER TABLE negocio ADD COLUMN lema TEXT;
      ALTER TABLE negocio ADD COLUMN color TEXT;
    `);
  }

  if (version < 16) {
    // la cotización suma las cantidades repetidas en una línea; cada partida recuerda si ya está sumada
    await db.execAsync('ALTER TABLE levantamiento ADD COLUMN en_cotizacion INTEGER NOT NULL DEFAULT 0');
    await db.execAsync(EN_COTIZACION_SQL);
  }

  if (version < 17) {
    // apodos del artículo: con ellos se encuentra al dictar un pedido ("gabinete 4u pequeño")
    await db.execAsync('ALTER TABLE catalogo ADD COLUMN apodos TEXT');
  }

  if (version < 18) {
    // prioridad del proyecto: 0 baja, 1 media (la de todos los anteriores), 2 alta
    await db.execAsync('ALTER TABLE proyectos ADD COLUMN prioridad INTEGER NOT NULL DEFAULT 1');
  }

  if (version < 19) {
    // características del equipo según su tipo (PoE, discos que soporta...), en JSON
    await db.execAsync('ALTER TABLE catalogo ADD COLUMN atributos TEXT');
  }

  if (version < 20) {
    // ejecución del proyecto (entre la cotización y la factura): líneas reales con lo cotizado para comparar, y comprobantes con foto
    await db.execAsync(`
      ALTER TABLE proyectos ADD COLUMN ejecucion_iniciada_en TEXT;
      CREATE TABLE IF NOT EXISTS ejecucion_items (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
        descripcion TEXT NOT NULL,
        detalle TEXT,
        cantidad INTEGER NOT NULL,
        cantidad_cotizada INTEGER NOT NULL DEFAULT 0,
        precio_cts INTEGER NOT NULL DEFAULT 0,
        descuento_pct REAL NOT NULL DEFAULT 0,
        tipo TEXT NOT NULL DEFAULT 'equipo',
        costo_cts INTEGER NOT NULL DEFAULT 0,
        item_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS comprobantes (
        id INTEGER PRIMARY KEY NOT NULL,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
        foto_uri TEXT NOT NULL,
        nota TEXT,
        monto_cts INTEGER,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  if (version < 21) {
    // descuento global del documento (en vez de uno por línea) y facturas sin comprobante: su NCF queda en 00000000, que puede repetirse
    await db.execAsync(`
      ALTER TABLE proyectos ADD COLUMN descuento_pct REAL NOT NULL DEFAULT 0;
      ALTER TABLE facturas ADD COLUMN descuento_pct REAL NOT NULL DEFAULT 0;
      ALTER TABLE facturas ADD COLUMN descuento_cts INTEGER NOT NULL DEFAULT 0;
      DROP INDEX IF EXISTS idx_facturas_ncf;
    `);
    const repetido = await db.getFirstAsync("SELECT 1 FROM facturas WHERE ncf <> '00000000' GROUP BY ncf HAVING COUNT(*) > 1");
    if (!repetido) await db.execAsync("CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_ncf ON facturas (ncf) WHERE ncf <> '00000000'");
  }

  if (version < 22) {
    // cotización antes que proyecto: aprobado_en vacío = cotización pendiente; cot_estado = borrador | enviada | rechazada | aprobada
    await db.execAsync(`
      ALTER TABLE proyectos ADD COLUMN aprobado_en TEXT;
      ALTER TABLE proyectos ADD COLUMN cot_estado TEXT NOT NULL DEFAULT 'borrador';
    `);
    await db.execAsync(APROBADOS_SQL);
  }

  if (version < 23) {
    // cuándo se envió la cotización (para dar seguimiento) y kits: paquetes de líneas que se agregan a una cotización de una vez
    await db.execAsync(`
      ALTER TABLE proyectos ADD COLUMN enviada_en TEXT;
      CREATE TABLE IF NOT EXISTS kits (
        id INTEGER PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS kit_items (
        id INTEGER PRIMARY KEY NOT NULL,
        kit_id INTEGER NOT NULL REFERENCES kits (id) ON DELETE CASCADE,
        descripcion TEXT NOT NULL,
        detalle TEXT,
        cantidad INTEGER NOT NULL,
        precio_cts INTEGER NOT NULL DEFAULT 0,
        tipo TEXT NOT NULL DEFAULT 'equipo',
        costo_cts INTEGER NOT NULL DEFAULT 0,
        item_id INTEGER
      );
    `);
  }

  if (version < 24) {
    // trabajos dentro de un proyecto (alarma, cámaras, portón...): cada línea dice a cuál pertenece; vacío = General
    await db.execAsync(`
      ALTER TABLE levantamiento ADD COLUMN trabajo TEXT;
      ALTER TABLE cotizacion_items ADD COLUMN trabajo TEXT;
      ALTER TABLE ejecucion_items ADD COLUMN trabajo TEXT;
      ALTER TABLE factura_items ADD COLUMN trabajo TEXT;
      ALTER TABLE kit_items ADD COLUMN trabajo TEXT;
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${VERSION_ACTUAL}`);
}

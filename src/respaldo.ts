import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { VERSION_ACTUAL } from '@/db/migraciones';

// Hijas primero al borrar, padres primero al insertar.
const TABLAS = ['clientes', 'proyectos', 'levantamiento', 'cotizacion_items', 'bitacora', 'facturas', 'factura_items', 'pagos', 'catalogo', 'negocio'];

/** Exporta la base de datos completa y abre la hoja de compartir. Las fotos NO van incluidas. */
export async function exportarRespaldo(db: SQLite.SQLiteDatabase) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const archivo = new File(Paths.cache, `multitec-respaldo-${new Date().toISOString().slice(0, 10)}.db`);
  archivo.create({ overwrite: true });
  archivo.write(await db.serializeAsync());
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/octet-stream', UTI: 'public.data' });
  return true;
}

/** Reemplaza todos los datos por los del respaldo. Lanza si el archivo no es un respaldo compatible. */
export async function restaurarRespaldo(db: SQLite.SQLiteDatabase,uriArchivo: string) {
  const copia = await SQLite.deserializeDatabaseAsync(await new File(uriArchivo).bytes());
  try {
    const v = await copia.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!v || v.user_version < 7 || v.user_version > VERSION_ACTUAL) throw new Error('El respaldo es de otra versión de la app.');
    const filas = new Map<string, Record<string, unknown>[]>();
    // un respaldo viejo no trae las tablas nuevas
    const existentes = new Set(
      (await copia.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((x) => x.name)
    );
    for (const t of TABLAS) filas.set(t, existentes.has(t) ? await copia.getAllAsync(`SELECT * FROM ${t}`) : []);
    // respaldo v7: las facturas pagadas pasan a tener un pago por el total
    if (v.user_version < 8) {
      filas.set('pagos', (filas.get('facturas') ?? []).filter((f) => f.pagada === 1).map((f) => ({ factura_id: f.id, monto_cts: f.total_cts })));
    }
    await db.withTransactionAsync(async () => {
      for (const t of [...TABLAS].reverse()) await db.runAsync(`DELETE FROM ${t}`);
      for (const t of TABLAS) {
        for (const f of filas.get(t) ?? []) {
          const cols = Object.keys(f);
          await db.runAsync(
            `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            cols.map((c) => f[c] as SQLite.SQLiteBindValue)
          );
        }
      }
    });
  } finally {
    await copia.closeAsync();
  }
}

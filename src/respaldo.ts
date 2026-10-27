import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { EN_COTIZACION_SQL, VERSION_ACTUAL } from '@/db/migraciones';
import { CODIGOS_SQL } from '@/nomenclatura';

// Hijas primero al borrar, padres primero al insertar.
const TABLAS = ['clientes', 'proyectos', 'levantamiento', 'cotizacion_items', 'bitacora', 'facturas', 'factura_items', 'pagos', 'catalogo', 'negocio'];

/** Exporta la base de datos completa y abre la hoja de compartir. Las fotos NO van incluidas. */
export async function exportarRespaldo(db: SQLite.SQLiteDatabase) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const archivo = new File(Paths.cache, `tekhnia-respaldo-${new Date().toISOString().slice(0, 10)}.db`);
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
    const validas = new Map<string, Set<string>>();
    for (const t of TABLAS) {
      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`);
      validas.set(t, new Set(info.map((c) => c.name)));
    }
    // un respaldo viejo puede traer filas huérfanas: se restaura tal cual y las claves se reactivan al final
    await db.execAsync('PRAGMA foreign_keys = OFF');
    await db.withTransactionAsync(async () => {
      for (const t of [...TABLAS].reverse()) await db.runAsync(`DELETE FROM ${t}`);
      for (const t of TABLAS) {
        for (const f of filas.get(t) ?? []) {
          const cols = Object.keys(f).filter((c) => validas.get(t)?.has(c)); // nombres del archivo no confiables
          await db.runAsync(
            `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            cols.map((c) => f[c] as SQLite.SQLiteBindValue)
          );
        }
      }
      // respaldo anterior a los códigos: se les asigna uno a cada artículo
      if (v.user_version < 13) await db.execAsync(CODIGOS_SQL);
      // respaldo anterior a la suma de líneas: sin esto todas las partidas figurarían como pendientes y se duplicarían
      if (v.user_version < 16) await db.execAsync(EN_COTIZACION_SQL);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
    await copia.closeAsync();
  }
}

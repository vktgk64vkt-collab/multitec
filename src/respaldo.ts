import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { APROBADOS_SQL, EN_COTIZACION_SQL, NUMEROS_FACTURA_SQL, VERSION_ACTUAL } from '@/db/migraciones';
import { CODIGOS_SQL } from '@/nomenclatura';

// Hijas primero al borrar, padres primero al insertar.
const TABLAS = ['clientes', 'proyectos', 'levantamiento', 'cotizacion_items', 'bitacora', 'facturas', 'factura_items', 'pagos', 'catalogo', 'negocio', 'ejecucion_items', 'comprobantes', 'kits', 'kit_items'];

const CLAVE_ULTIMO = 'ultimo_respaldo';
export const DIAS_ENTRE_RESPALDOS = 7;

/** Días desde el último respaldo guardado, o null si nunca se ha hecho uno. */
export async function diasSinRespaldo(): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  try {
    const t = await SecureStore.getItemAsync(CLAVE_ULTIMO);
    return t ? Math.floor((Date.now() - Number(t)) / 86_400_000) : null;
  } catch {
    return null;
  }
}

const anotarRespaldo = () => SecureStore.setItemAsync(CLAVE_ULTIMO, String(Date.now())).catch(() => undefined);

const carpetaFotos = () => new Directory(Paths.document, 'fotos');

/** "tekhnia-respaldo-2026-10-27-1504.db": con la hora, para no chocar con otro del mismo día. */
const nombreRespaldo = () => `tekhnia-respaldo-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.db`;

/** Abre el selector de carpetas de iOS (Archivos, iCloud, el iPhone) y guarda ahí el respaldo. Devuelve false si cancelas. */
export async function guardarRespaldoEn(db: SQLite.SQLiteDatabase) {
  let carpeta: Directory;
  try {
    carpeta = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String((e as { code?: string })?.code ?? '') + String(e))) return false;
    throw e;
  }
  const nombre = nombreRespaldo();
  const archivo = carpeta.createFile(nombre, 'application/octet-stream');
  archivo.write(await db.serializeAsync());
  // las fotos van en una carpeta junto al respaldo: sin ellas, al restaurar quedan imágenes en blanco
  if (carpetaFotos().exists) {
    const destino = carpeta.createDirectory(nombre.replace(/\.db$/, '') + '-fotos');
    for (const f of carpetaFotos().list()) if (f instanceof File) f.copySync(destino);
  }
  await anotarRespaldo();
  return true;
}

/** Exporta la base de datos completa y abre la hoja de compartir (AirDrop, correo...). Las fotos NO van incluidas. */
export async function exportarRespaldo(db: SQLite.SQLiteDatabase) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const archivo = new File(Paths.cache, nombreRespaldo());
  archivo.create({ overwrite: true });
  archivo.write(await db.serializeAsync());
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/octet-stream', UTI: 'public.data' });
  await anotarRespaldo();
  return true;
}

/** Devuelve las fotos desde la carpeta "…-fotos" que se guardó junto al respaldo. Devuelve cuántas copió, o null si cancelas. */
export async function restaurarFotos(): Promise<number | null> {
  let origen: Directory;
  try {
    origen = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String((e as { code?: string })?.code ?? '') + String(e))) return null;
    throw e;
  }
  carpetaFotos().create({ idempotent: true, intermediates: true });
  let n = 0;
  for (const f of origen.list()) {
    if (f instanceof File) {
      f.copySync(carpetaFotos());
      n++;
    }
  }
  return n;
}

/** Reemplaza todos los datos por los del respaldo. Lanza si el archivo no es un respaldo compatible. */
export async function restaurarRespaldo(db: SQLite.SQLiteDatabase,uriArchivo: string) {
  const copia = await SQLite.deserializeDatabaseAsync(await new File(uriArchivo).bytes());
  try {
    const v = await copia.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!v || v.user_version < 7 || v.user_version > VERSION_ACTUAL) throw new Error(`El respaldo es de otra versión de la app (versión ${v?.user_version ?? '?'}, esta app usa ${VERSION_ACTUAL}).`);
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
          try {
            await db.runAsync(
              `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
              cols.map((c) => f[c] as SQLite.SQLiteBindValue)
            );
          } catch (e) {
            throw new Error(`Falló al restaurar «${t}» (fila ${String(f.id ?? '?')}): ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      // respaldo anterior a los códigos: se les asigna uno a cada artículo
      if (v.user_version < 13) await db.execAsync(CODIGOS_SQL);
      // respaldo anterior a la suma de líneas: sin esto todas las partidas figurarían como pendientes y se duplicarían
      if (v.user_version < 16) await db.execAsync(EN_COTIZACION_SQL);
      // respaldo anterior a cotización/proyecto: sin esto todos los proyectos figurarían como cotizaciones pendientes
      if (v.user_version < 22) await db.execAsync(APROBADOS_SQL);
      // respaldo anterior al número de factura
      if (v.user_version < 27) await db.execAsync(NUMEROS_FACTURA_SQL);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
    await copia.closeAsync();
  }
}

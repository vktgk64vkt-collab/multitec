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

export type Avance = (texto: string, fraccion: number) => void;
export interface ResultadoRespaldo {
  nombre: string;
  bytes: number;
  fotos: number;
}

// deja respirar a la pantalla entre pasos para que la barra de progreso se vea avanzar
const respirar = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Abre el selector de carpetas de iOS (Archivos, iCloud, el iPhone) y guarda ahí el respaldo. En iOS ese selector solo
 * ofrece «Abrir»: tocarlo elige la carpeta y aquí se guarda. Devuelve null si cancelas. Comprueba que el archivo quedó
 * escrito completo antes de dar el respaldo por hecho.
 */
export async function guardarRespaldoEn(db: SQLite.SQLiteDatabase, avance?: Avance): Promise<ResultadoRespaldo | null> {
  let carpeta: Directory;
  try {
    carpeta = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String((e as { code?: string })?.code ?? '') + String(e))) return null;
    throw e;
  }
  avance?.('Guardando la base de datos…', 0.1);
  await respirar();
  const nombre = nombreRespaldo();
  const datos = await db.serializeAsync();
  // se arma primero en la caché (ahí siempre se puede escribir) y se copia a la carpeta elegida, igual que las fotos
  const temporal = new File(Paths.cache, nombre);
  temporal.create({ overwrite: true });
  temporal.write(datos);
  temporal.copySync(carpeta);
  temporal.delete();
  const archivo = new File(carpeta, nombre);
  if (!archivo.exists || archivo.size !== datos.length) throw new Error('El archivo del respaldo no quedó completo en esa carpeta. Elige otra carpeta (por ejemplo En mi iPhone o iCloud Drive).');
  avance?.('Base de datos guardada', 0.4);
  // las fotos van en una carpeta junto al respaldo: sin ellas, al restaurar quedan imágenes en blanco
  let fotos = 0;
  if (carpetaFotos().exists) {
    const origen = carpetaFotos().list().filter((f): f is File => f instanceof File);
    const destino = carpeta.createDirectory(nombre.replace(/\.db$/, '') + '-fotos');
    for (const f of origen) {
      f.copySync(destino);
      fotos++;
      avance?.(`Copiando fotos (${fotos} de ${origen.length})…`, 0.4 + 0.55 * (fotos / origen.length));
      await respirar();
    }
  }
  await anotarRespaldo();
  avance?.('Listo', 1);
  return { nombre, bytes: datos.length, fotos };
}

/** Exporta la base de datos completa y abre la hoja de compartir (AirDrop, correo, Guardar en Archivos). Las fotos NO van incluidas. */
export async function exportarRespaldo(db: SQLite.SQLiteDatabase, avance?: Avance): Promise<ResultadoRespaldo | false> {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  avance?.('Preparando el respaldo…', 0.3);
  await respirar();
  const nombre = nombreRespaldo();
  const datos = await db.serializeAsync();
  const archivo = new File(Paths.cache, nombre);
  archivo.create({ overwrite: true });
  archivo.write(datos);
  avance?.('', -1); // cierra la ventana de progreso: la hoja de compartir no puede abrirse encima
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/octet-stream', UTI: 'public.data' });
  await anotarRespaldo();
  avance?.('Listo', 1);
  return { nombre, bytes: datos.length, fotos: 0 };
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

const CABECERA_SQLITE = 'SQLite format 3\0';

/**
 * Abre el archivo del respaldo sin tocar la base real. Primero valida que de verdad sea una base SQLite (un archivo vacío
 * o un marcador de iCloud sin descargar daba «unable to open database file»). Si abrirlo desde memoria falla, lo copia
 * a un archivo temporal y lo abre desde ahí.
 */
async function abrirCopia(uriArchivo: string) {
  const bytes = await new File(uriArchivo).bytes();
  if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 16)) !== CABECERA_SQLITE) {
    throw new Error(
      bytes.length === 0
        ? 'El archivo está vacío. Si está en iCloud Drive, ábrelo primero en Archivos para que se descargue y vuelve a elegirlo.'
        : `El archivo no es un respaldo de la app (${bytes.length} bytes, no es una base de datos). Elige el archivo tekhnia-respaldo-….db.`
    );
  }
  try {
    return await SQLite.deserializeDatabaseAsync(bytes);
  } catch {
    const temporal = new File(SQLite.defaultDatabaseDirectory, 'restaurar-temporal.db');
    if (temporal.exists) temporal.delete();
    temporal.create();
    temporal.write(bytes);
    return SQLite.openDatabaseAsync('restaurar-temporal.db');
  }
}

/** Reemplaza todos los datos por los del respaldo. Lanza si el archivo no es un respaldo compatible. */
export async function restaurarRespaldo(db: SQLite.SQLiteDatabase,uriArchivo: string) {
  const copia = await abrirCopia(uriArchivo);
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
    try {
      const t = new File(SQLite.defaultDatabaseDirectory, 'restaurar-temporal.db');
      if (t.exists) t.delete();
    } catch {}
  }
}

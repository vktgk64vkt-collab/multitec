import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { registrarAviso } from '@/avisos';
import { migrarBaseDeDatos, VERSION_ACTUAL } from '@/db/migraciones';

const CONSERVAR = 7;
const carpeta = () => new Directory(Paths.document, 'copias');

/** Cuáles copias borrar para quedarse con las más recientes. Los nombres llevan la fecha, así que ordenar = ordenar por tiempo. */
export function sobrantes(nombres: string[], conservar = CONSERVAR): string[] {
  return [...nombres].sort().reverse().slice(conservar);
}

/** Copias automáticas guardadas en el teléfono, la más reciente primero. */
export function listarCopias(): File[] {
  if (Platform.OS === 'web' || !carpeta().exists) return [];
  return carpeta()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.db'))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Guarda una copia de la base de datos y borra las más viejas. `etiqueta` distingue la diaria de la previa a migrar. */
async function copiar(db: SQLite.SQLiteDatabase, etiqueta: string) {
  const dir = carpeta();
  dir.create({ idempotent: true, intermediates: true });
  const sello = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const f = new File(dir, `auto-${sello}-${etiqueta}.db`);
  const datos = await db.serializeAsync();
  f.create({ overwrite: true }); // write() no crea el archivo
  f.write(datos);
  if (f.size !== datos.length) throw new Error('La copia automática quedó incompleta');
  for (const n of sobrantes(listarCopias().map((x) => x.name))) new File(dir, n).delete();
}

/** Una copia por día como máximo; nunca debe impedir que la app abra. */
export async function copiaDiaria(db: SQLite.SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    if (listarCopias().some((f) => f.name.startsWith(`auto-${hoy}`))) return;
    await copiar(db, `v${VERSION_ACTUAL}`);
  } catch (e) {
    registrarAviso(e, 'copia.diaria'); // la app sigue funcionando sin copia, pero el fallo queda en Avisos
  }
}

/** Migra la base; si hay que subir de versión, antes deja una copia por si la migración sale mal. */
export async function migrarConCopia(db: SQLite.SQLiteDatabase) {
  if (Platform.OS !== 'web') {
    try {
      const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if (v && v.user_version > 0 && v.user_version < VERSION_ACTUAL) await copiar(db, `antes-de-v${VERSION_ACTUAL}`);
    } catch (e) {
      registrarAviso(e, 'copia.antes-de-migrar');
    }
  }
  await migrarBaseDeDatos(db);
}

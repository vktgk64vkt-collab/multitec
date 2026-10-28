import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { obtenerNegocio } from './db/negocio';
import { uriFoto } from './fotos';
import { htmlDocumento, nombreArchivoPdf, type DatosPdf } from './pdfHtml';

export type { DatosPdf } from './pdfHtml';

/**
 * Empresa del usuario para el encabezado de los documentos: su perfil (Más, Mi empresa) con el logo ya leído.
 * Sin logo, el documento usa el nombre de la empresa como texto.
 */
export async function negocioParaPdf(db: SQLiteDatabase): Promise<DatosPdf['negocio']> {
  const n = await obtenerNegocio(db);
  if (!n) return null;
  try {
    const logo_base64 = n.logo_uri ? await new File(uriFoto(n.logo_uri)).base64() : undefined;
    return { ...n, logo_base64 };
  } catch {
    return n; // logo borrado o ilegible: el documento sale con el nombre en texto
  }
}

// El documento que se está por exportar; la pantalla de vista previa lo toma de aquí (una ruta no puede llevarlo en su dirección).
let pendiente: DatosPdf | null = null;
let despuesDeCompartir: (() => unknown) | undefined;
export const documentoPendiente = () => pendiente;
export const alCompartirPendiente = () => despuesDeCompartir;

/** Abre la vista previa del documento; desde ahí se comparte. `alCompartir` corre cuando se abre la hoja de compartir. */
export function previsualizar(d: DatosPdf, alCompartir?: () => unknown) {
  pendiente = d;
  despuesDeCompartir = alCompartir;
  router.push('/vista-previa');
}

export interface ArchivoPdf {
  uri: string;
  nombre: string;
}

/** Genera el PDF y lo deja en caché con el nombre del documento ("Cotización 12 - Cliente - Proyecto.pdf"). */
export async function generarPdf(d: DatosPdf): Promise<ArchivoPdf> {
  const { uri } = await Print.printToFileAsync({ html: htmlDocumento(d) });
  const nombre = nombreArchivoPdf(d);
  const destino = new File(Paths.cache, nombre);
  new File(uri).copySync(destino, { overwrite: true });
  return { uri: destino.uri, nombre };
}

/** Abre la hoja de compartir de iOS con el archivo ya nombrado. */
export async function compartirArchivo(a: ArchivoPdf) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartir no está disponible en este dispositivo.');
  await Sharing.shareAsync(a.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: a.nombre });
}

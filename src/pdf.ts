import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { obtenerNegocio } from './db/negocio';
import { uriFoto } from './fotos';
import { htmlDocumento, type DatosPdf } from './pdfHtml';

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

/** Genera el PDF y abre la hoja de compartir de iOS. Devuelve false si el dispositivo no puede (p. ej. web). */
export async function compartirPdf(d: DatosPdf) {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html: htmlDocumento(d) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return true;
}

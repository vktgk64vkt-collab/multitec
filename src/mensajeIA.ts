// Mensajes de WhatsApp (seguimiento de cotización, cobro) redactados por Claude. Si Claude no está disponible (sin clave,
// sin internet, o el ajuste "Solo el iPhone"), sale el texto de plantilla. Siempre se muestra antes de enviarlo.
import type { SQLiteDatabase } from 'expo-sqlite';
import { Linking } from 'react-native';

import { Alert } from './alert';
import { leerClave, leerModoEntender, redactarConClaude } from './claude';
import { urlWhatsApp } from './contacto';
import { obtenerNegocio } from './db/negocio';
import type { TipoRedaccion } from './ia';

export async function empresaActual(db: SQLiteDatabase) {
  return (await obtenerNegocio(db))?.nombre?.trim() || null;
}

/** Redacta con Claude si se puede; si no, devuelve la plantilla. `claude` dice cuál de los dos salió. */
export async function redactar(
  db: SQLiteDatabase,
  tipo: Exclude<TipoRedaccion, 'alcance'>,
  datos: Record<string, string | null | undefined>,
  plantilla: string
): Promise<{ texto: string; claude: boolean }> {
  if (!(await leerClave()) || (await leerModoEntender()) === 'local') return { texto: plantilla, claude: false };
  try {
    return { texto: await redactarConClaude(tipo, datos, await empresaActual(db)), claude: true };
  } catch {
    return { texto: plantilla, claude: false };
  }
}

/** Muestra el mensaje y, si el usuario quiere, abre WhatsApp con él. */
export function ofrecerWhatsApp(telefono: string | null | undefined, texto: string, claude: boolean) {
  Alert.alert(claude ? 'Mensaje redactado por Claude' : 'Mensaje listo', texto, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Enviar por WhatsApp',
      onPress: () => {
        const url = urlWhatsApp(telefono, texto);
        if (!url) return Alert.alert('Sin teléfono', 'Agrega el teléfono del cliente para escribirle por WhatsApp.');
        Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir WhatsApp', 'Revisa que esté instalado en este iPhone.'));
      },
    },
  ]);
}

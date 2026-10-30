import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Preferencias del dispositivo (no van en el respaldo de la base de datos).
const CUADRO = 'dictado_cuadro_oculto';
const POS_MIC = 'dictado_boton_pos';

const web = Platform.OS === 'web';

/** true = en la pantalla de dictado solo se ve el micrófono, sin el cuadro de texto. */
export async function cuadroDictadoOculto() {
  if (web) return false;
  try {
    return (await SecureStore.getItemAsync(CUADRO)) === '1';
  } catch {
    return false;
  }
}

export async function guardarCuadroDictadoOculto(oculto: boolean) {
  if (!web) await SecureStore.setItemAsync(CUADRO, oculto ? '1' : '0');
}

export interface PosicionMic {
  x: number; // distancia al borde derecho
  y: number; // distancia al borde inferior (sobre el área segura)
}

export async function leerPosicionMic(): Promise<PosicionMic | null> {
  if (web) return null;
  try {
    const p = JSON.parse((await SecureStore.getItemAsync(POS_MIC)) ?? '');
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null;
  } catch {
    return null;
  }
}

export async function guardarPosicionMic(p: PosicionMic | null) {
  if (web) return;
  if (p) await SecureStore.setItemAsync(POS_MIC, JSON.stringify(p));
  else await SecureStore.deleteItemAsync(POS_MIC);
}

const NEMA = 'materiales_nema';

/** Texto de las medidas NEMA que editó el usuario ("6x6, 8x8..."), o null si usa las de fábrica. */
export async function leerNemaGuardado(): Promise<string | null> {
  if (web) return null;
  try {
    return (await SecureStore.getItemAsync(NEMA)) || null;
  } catch {
    return null;
  }
}

export async function guardarNema(texto: string) {
  if (!web) await SecureStore.setItemAsync(NEMA, texto);
}

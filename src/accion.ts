import * as Haptics from 'expo-haptics';

import { Alert } from '@/alert';

/** Toque de vibración suave al pulsar. En web o sin motor háptico no hace nada. */
export function haptico() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {}
}

export function mensajeError(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Ejecuta una acción y, si falla, lo dice en una alerta en vez de quedarse en silencio. */
export async function intentar(accion: () => unknown) {
  try {
    await accion();
  } catch (e) {
    Alert.alert('No se pudo completar', mensajeError(e));
  }
}

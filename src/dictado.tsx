import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptico } from '@/accion';
import { color } from '@/tema';

/** Micrófono dibujado con formas simples (sin imágenes ni módulos de iconos). */
export function IconoMic({ tono = '#ffffff', escala = 1 }: { tono?: string; escala?: number }) {
  return (
    <View style={{ alignItems: 'center', transform: [{ scale: escala }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: 14, height: 22, borderRadius: 7, backgroundColor: tono }} />
      <View style={{ width: 24, height: 12, marginTop: -8, borderWidth: 2.5, borderTopWidth: 0, borderColor: tono, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }} />
      <View style={{ width: 2.5, height: 5, backgroundColor: tono }} />
    </View>
  );
}

/**
 * Botón redondo flotante abajo a la derecha: un toque y la app empieza a escucharte. Lo que dictes lo entiende Claude
 * y te lo muestra para revisarlo antes de agregarlo al proyecto. Dentro de un proyecto trabaja sobre ese proyecto; en
 * las pestañas te deja elegir cuál. `sobreBarra` lo sube para que no tape la barra de pestañas.
 */
export function BotonDictado({ proyectoId, sobreBarra = false }: { proyectoId?: number; sobreBarra?: boolean }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dictar un pedido a Claude"
      accessibilityHint="Toca y habla; se agrega al levantamiento después de que lo revises"
      style={[estilos.boton, { bottom: bottom + (sobreBarra ? 56 : 0) + 20 }]}
      onPress={() => {
        haptico();
        router.push({ pathname: '/pedido', params: { ...(proyectoId ? { proyecto: proyectoId } : {}), auto: '1' } });
      }}>
      <IconoMic />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  boton: {
    position: 'absolute',
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.primario,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 10,
  },
});

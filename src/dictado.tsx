import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptico } from '@/accion';
import { leerPosicionMic, guardarPosicionMic, type PosicionMic } from '@/ajustes';
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

interface Vivo {
  pos: PosicionMic;
  inicio: PosicionMic;
  proyectoId?: number;
  limite: { width: number; height: number; top: number; bottom: number };
}

/** Un toque abre el dictado; mantener y arrastrar mueve el botón (x se mide desde la derecha y y desde abajo, por eso restan). */
function crearGesto(leer: () => Vivo, setPos: (p: PosicionMic) => void) {
  const limitar = (v: PosicionMic): PosicionMic => {
    const l = leer().limite;
    return { x: Math.min(Math.max(v.x, 8), l.width - TAM - 8), y: Math.min(Math.max(v.y, l.bottom + 8), l.height - l.top - TAM - 8) };
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      leer().inicio = leer().pos;
    },
    onPanResponderMove: (_, g) => setPos(limitar({ x: leer().inicio.x - g.dx, y: leer().inicio.y - g.dy })),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
        setPos(leer().inicio);
        haptico();
        router.push({ pathname: '/pedido', params: { ...(leer().proyectoId ? { proyecto: leer().proyectoId } : {}), auto: '1' } });
      } else {
        guardarPosicionMic(limitar({ x: leer().inicio.x - g.dx, y: leer().inicio.y - g.dy })).catch(() => undefined);
      }
    },
  });
}

/**
 * Botón redondo flotante (abajo a la derecha al inicio): un toque y la app empieza a escucharte. Lo que dictes lo entiende
 * Claude y te lo muestra para revisarlo antes de agregarlo al proyecto. Mantén y arrastra para moverlo donde no tape nada;
 * la posición se recuerda. Dentro de un proyecto trabaja sobre ese proyecto; en las pestañas te deja elegir cuál.
 * `sobreBarra` lo sube para que no tape la barra de pestañas.
 */
export function BotonDictado({ proyectoId, sobreBarra = false }: { proyectoId?: number; sobreBarra?: boolean }) {
  const { bottom, top } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const base: PosicionMic = { x: 20, y: bottom + (sobreBarra ? 56 : 0) + 20 };
  const [pos, setPos] = useState<PosicionMic | null>(null);
  // lo que el gesto necesita leer sin volver a crearse: se actualiza fuera del render
  const [vivo] = useState<Vivo>(() => ({ pos: base, inicio: base, proyectoId, limite: { width, height, top, bottom } }));
  useEffect(() => {
    Object.assign(vivo, { pos: pos ?? base, proyectoId, limite: { width, height, top, bottom } });
  });

  useEffect(() => {
    leerPosicionMic().then(setPos);
  }, []);

  const [gesto] = useState(() => crearGesto(() => vivo, setPos));

  const p = pos ?? base;
  return (
    <View
      {...gesto.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Dictar un pedido a Claude"
      accessibilityHint="Toca y habla; se agrega al levantamiento después de que lo revises. Mantén y arrastra para moverlo"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => router.push({ pathname: '/pedido', params: { ...(proyectoId ? { proyecto: proyectoId } : {}), auto: '1' } })}
      style={[estilos.boton, { right: p.x, bottom: p.y }]}>
      <IconoMic />
    </View>
  );
}

const TAM = 64;

const estilos = StyleSheet.create({
  boton: {
    position: 'absolute',
    width: TAM,
    height: TAM,
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

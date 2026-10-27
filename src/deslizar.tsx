import { type ReactNode, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { haptico } from '@/accion';

const ANCHO = 96; // lo que asoma el botón al deslizar
const UMBRAL = ANCHO / 2; // pasado este punto, al soltar queda abierto

/** Posición animada y gesto de una fila; se crea una sola vez por fila. */
function crearControl() {
  const x = new Animated.Value(0);
  const estado = { abierta: false };

  const mover = (abrir: boolean) => {
    estado.abierta = abrir;
    Animated.spring(x, { toValue: abrir ? -ANCHO : 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const gesto = PanResponder.create({
    // tocar una fila abierta solo la cierra: no abre lo que contiene
    onStartShouldSetPanResponderCapture: () => estado.abierta,
    // solo cuenta un arrastre claramente horizontal; el vertical lo sigue teniendo la lista
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      const base = estado.abierta ? -ANCHO : 0;
      x.setValue(Math.max(-ANCHO * 1.3, Math.min(0, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) return mover(false); // fue un toque
      const base = estado.abierta ? -ANCHO : 0;
      const abrir = base + g.dx < -UMBRAL;
      if (abrir && !estado.abierta) haptico();
      mover(abrir);
    },
    onPanResponderTerminate: () => mover(estado.abierta),
  });

  return { x, mover, gesto, opacidad: x.interpolate({ inputRange: [-ANCHO, -6, 0], outputRange: [1, 1, 0] }) };
}

/**
 * Fila que se desliza hacia la izquierda y deja ver un botón rojo ("Eliminar", "Anular"...). Tocar el botón ejecuta
 * `onAccion`, que debe pedir confirmación si lo que borra no se puede recuperar. Tocar la fila abierta la cierra.
 * Hecha con gestos y animación del propio React Native: sin módulos nativos extra.
 */
export function FilaDeslizable({
  children,
  onAccion,
  etiqueta = 'Eliminar',
  deshabilitada = false,
}: {
  children: ReactNode;
  onAccion: () => unknown;
  etiqueta?: string;
  deshabilitada?: boolean;
}) {
  const [control] = useState(crearControl);
  if (deshabilitada) return <>{children}</>;

  return (
    <View>
      <Animated.View style={[estilos.accion, { opacity: control.opacidad }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={etiqueta}
          style={estilos.boton}
          onPress={() => {
            control.mover(false);
            onAccion();
          }}>
          <Text style={estilos.texto}>{etiqueta}</Text>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: control.x }] }} {...control.gesto.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const estilos = StyleSheet.create({
  accion: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ANCHO },
  boton: { flex: 1, marginLeft: 8, borderRadius: 14, backgroundColor: '#c0262d', alignItems: 'center', justifyContent: 'center' },
  texto: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

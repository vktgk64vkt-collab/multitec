import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, LayoutAnimation, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { haptico, intentar } from '@/accion';
import { color, tarjeta } from '@/tema';

// Zona táctil mínima recomendada por Apple y por las guías de UX.
export const TOQUE_MIN = 44;

/**
 * Para listas y formularios con campos de texto: al abrir el teclado el contenido sube lo necesario para que el campo
 * que estás escribiendo nunca quede tapado, y arrastrar hacia abajo cierra el teclado.
 */
export const PROPS_TECLADO = {
  automaticallyAdjustKeyboardInsets: true,
  keyboardDismissMode: 'interactive',
  keyboardShouldPersistTaps: 'handled',
} as const;

export function Tarjeta({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[tarjeta, { gap: 8 }, style]}>{children}</View>;
}

export function Etiqueta({ children }: { children: ReactNode }) {
  return <Text style={estilos.etiqueta}>{children}</Text>;
}

export function Campo(props: TextInputProps & { multilinea?: boolean }) {
  const { multilinea, style, ...resto } = props;
  return (
    <TextInput
      placeholderTextColor={color.suave}
      accessibilityLabel={props.placeholder}
      multiline={multilinea}
      {...resto}
      style={[estilos.campo, multilinea && estilos.multilinea, style]}
    />
  );
}

/** Icono de SF Symbols (el set nativo de iOS): nítido y combina con el sistema. */
export function Icono({ nombre, tam = 18, tinte = color.texto }: { nombre: SFSymbol; tam?: number; tinte?: string }) {
  return <SymbolView name={nombre} size={tam} tintColor={tinte} weight="medium" style={{ width: tam, height: tam }} />;
}

let sinMovimiento = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => (sinMovimiento = v))
  .catch(() => {});

/** Todo lo que se toca se hunde un poquito y rebota: confirma el toque sin sumar nada a la pantalla. */
export function Presionable({
  children,
  style,
  hundir = 0.97,
  ...props
}: Omit<ComponentProps<typeof Pressable>, 'style' | 'children'> & { children: ReactNode; style?: ViewStyle | (ViewStyle | false | undefined)[]; hundir?: number }) {
  const [escala] = useState(() => new Animated.Value(1));
  const mover = (a: number) => {
    if (sinMovimiento) return;
    Animated.spring(escala, { toValue: a, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        mover(hundir);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        mover(1);
        props.onPressOut?.(e);
      }}>
      <Animated.View style={[style, { transform: [{ scale: escala }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Aparece suave (fundido + subida corta); el índice escalona las filas de una lista. */
export function Aparece({ children, indice = 0, style }: { children: ReactNode; indice?: number; style?: ViewStyle }) {
  const [v] = useState(() => new Animated.Value(sinMovimiento ? 1 : 0));
  useEffect(() => {
    if (sinMovimiento) return;
    Animated.timing(v, { toValue: 1, duration: 260, delay: Math.min(indice, 8) * 40, useNativeDriver: true }).start();
  }, [v, indice]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

/** Botón que ignora el segundo toque mientras la acción corre, muestra el error si falla y vibra al pulsar. */
export function Boton({
  texto,
  onPress,
  tipo = 'primario',
  icono,
}: {
  texto: string;
  onPress: () => unknown;
  tipo?: 'primario' | 'secundario' | 'peligro';
  icono?: SFSymbol;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function pulsar() {
    if (ocupado) return;
    haptico();
    setOcupado(true);
    await intentar(onPress);
    setOcupado(false);
  }

  const tinte = tipo === 'secundario' ? color.primario : '#fff';
  return (
    <Presionable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: ocupado, busy: ocupado }}
      style={[estilos.boton, tipo === 'secundario' && estilos.secundario, tipo === 'peligro' && estilos.peligro, ocupado && estilos.ocupado]}
      onPress={pulsar}>
      {icono ? <Icono nombre={icono} tinte={tinte} tam={16} /> : null}
      <Text style={[estilos.textoBoton, tipo === 'secundario' && { color: color.primario }]}>{texto}</Text>
    </Presionable>
  );
}

export interface AccionRapida {
  icono: SFSymbol;
  texto: string;
  onPress: () => unknown;
  tono?: 'normal' | 'ok' | 'peligro';
  /** Resalta la acción principal con relleno. */
  principal?: boolean;
}

/**
 * Varias acciones en UNA sola línea: icono arriba y una palabra corta abajo, repartidas a partes iguales.
 * Reemplaza una pila de botones grandes.
 */
export function FilaAcciones({ acciones }: { acciones: AccionRapida[] }) {
  return (
    <View style={estilos.acciones}>
      {acciones.map((a) => {
        const tinte = a.principal ? '#fff' : a.tono === 'peligro' ? color.peligro : a.tono === 'ok' ? color.ok : color.primario;
        return (
          <View key={a.texto} style={{ flex: 1 }}>
            <Presionable
              accessibilityRole="button"
              accessibilityLabel={a.texto}
              style={[estilos.accion, a.principal && { backgroundColor: a.tono === 'ok' ? color.ok : color.primario, borderColor: 'transparent' }]}
              onPress={() => {
                haptico();
                intentar(a.onPress);
              }}>
              <Icono nombre={a.icono} tinte={tinte} tam={20} />
              <Text style={[estilos.textoAccion, { color: tinte }]} numberOfLines={1}>
                {a.texto}
              </Text>
            </Presionable>
          </View>
        );
      })}
    </View>
  );
}

/** Elegir una opción entre pocas, todas en una línea (borrador / enviada / rechazada). */
export function Segmentos<T extends string>({
  opciones,
  valor,
  onElegir,
}: {
  opciones: { valor: T; texto: string; icono: SFSymbol }[];
  valor: string;
  onElegir: (v: T) => unknown;
}) {
  return (
    <View style={estilos.segmentos}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="button"
            accessibilityLabel={o.texto}
            accessibilityState={{ selected: activo }}
            style={[estilos.segmento, activo && estilos.segmentoActivo]}
            onPress={() => {
              haptico();
              intentar(() => onElegir(o.valor));
            }}>
            <Icono nombre={o.icono} tam={15} tinte={activo ? '#fff' : color.suave} />
            <Text style={[estilos.textoSegmento, activo && { color: '#fff', fontWeight: '600' }]} numberOfLines={1}>
              {o.texto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Opción seleccionable (filtros, tipos, niveles de precio): 44 pt de alto y avisa a VoiceOver si está elegida. */
export function Chip({ texto, activo = false, onPress, borde = false }: { texto: string; activo?: boolean; onPress: () => unknown; borde?: boolean }) {
  return (
    <Presionable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      hundir={0.95}
      style={[estilos.chip, borde && estilos.chipBorde, activo && estilos.chipActivo]}
      onPress={() => {
        haptico();
        intentar(onPress);
      }}>
      <Text style={[estilos.textoChip, activo && estilos.textoChipActivo]}>{texto}</Text>
    </Presionable>
  );
}

/**
 * Barra con despliegue: cerrada muestra solo el nombre del campo y lo elegido; al tocarla se abren las opciones.
 * Sirve para formularios largos donde cada campo es una elección entre pocas opciones.
 */
export function Desplegable({
  etiqueta,
  valor,
  vacio = false,
  abierto,
  onAlternar,
  children,
}: {
  etiqueta: string;
  valor: string;
  vacio?: boolean;
  abierto: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <View style={estilos.desplegable}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${valor}`}
        accessibilityState={{ expanded: abierto }}
        style={estilos.desplegableFila}
        onPress={() => {
          haptico();
          if (!sinMovimiento) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onAlternar();
        }}>
        <Text style={estilos.desplegableEtiqueta}>{etiqueta}</Text>
        <Text style={[estilos.desplegableValor, vacio && estilos.desplegableVacio]} numberOfLines={1}>
          {valor}
        </Text>
        <Icono nombre={abierto ? 'chevron.up' : 'chevron.down'} tam={12} tinte={color.suave} />
      </Pressable>
      {abierto ? <View style={estilos.desplegableCuerpo}>{children}</View> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  desplegable: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borde },
  desplegableFila: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  desplegableEtiqueta: { width: 118, fontSize: 14, color: color.suave },
  desplegableValor: { flex: 1, fontSize: 16, fontWeight: '600', color: color.texto, textAlign: 'right' },
  desplegableVacio: { fontWeight: '400', color: color.suave },
  desplegableFlecha: { fontSize: 14, color: color.suave, width: 16, textAlign: 'center' },
  desplegableCuerpo: { paddingBottom: 12, gap: 10 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: color.suave, marginTop: 4 },
  campo: { padding: 12, minHeight: TOQUE_MIN, borderRadius: 12, backgroundColor: color.fondo, fontSize: 16, color: color.texto },
  multilinea: { minHeight: 90, textAlignVertical: 'top' },
  boton: { paddingHorizontal: 16, paddingVertical: 10, minHeight: TOQUE_MIN, borderRadius: 12, backgroundColor: color.primario, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  acciones: { flexDirection: 'row', gap: 8 },
  accion: { minHeight: 56, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: color.borde, backgroundColor: color.tarjeta, alignItems: 'center', justifyContent: 'center', gap: 3 },
  textoAccion: { fontSize: 11, fontWeight: '600' },
  segmentos: { flexDirection: 'row', backgroundColor: '#ebe3d8', borderRadius: 12, padding: 3 },
  segmento: { flex: 1, minHeight: 38, borderRadius: 10, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  segmentoActivo: { backgroundColor: color.primario },
  textoSegmento: { fontSize: 13, color: color.suave },
  secundario: { backgroundColor: color.tarjeta, borderWidth: StyleSheet.hairlineWidth, borderColor: color.suave },
  peligro: { backgroundColor: color.peligro },
  ocupado: { opacity: 0.6 },
  textoBoton: { color: '#fff', fontSize: 15, fontWeight: '600' },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  chipBorde: { borderWidth: 1, borderColor: color.borde },
  chipActivo: { backgroundColor: color.primario, borderColor: color.primario },
  textoChip: { color: color.texto, textTransform: 'none' },
  textoChipActivo: { color: '#fff', fontWeight: '600' },
});

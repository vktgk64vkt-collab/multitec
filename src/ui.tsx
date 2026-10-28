import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

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

/** Botón que ignora el segundo toque mientras la acción corre, muestra el error si falla y vibra al pulsar. */
export function Boton({
  texto,
  onPress,
  tipo = 'primario',
}: {
  texto: string;
  onPress: () => unknown;
  tipo?: 'primario' | 'secundario' | 'peligro';
}) {
  const [ocupado, setOcupado] = useState(false);

  async function pulsar() {
    if (ocupado) return;
    haptico();
    setOcupado(true);
    await intentar(onPress);
    setOcupado(false);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: ocupado, busy: ocupado }}
      style={[estilos.boton, tipo === 'secundario' && estilos.secundario, tipo === 'peligro' && estilos.peligro, ocupado && estilos.ocupado]}
      onPress={pulsar}>
      <Text style={[estilos.textoBoton, tipo === 'secundario' && { color: color.primario }]}>{texto}</Text>
    </Pressable>
  );
}

/** Opción seleccionable (filtros, tipos, niveles de precio): 44 pt de alto y avisa a VoiceOver si está elegida. */
export function Chip({ texto, activo = false, onPress, borde = false }: { texto: string; activo?: boolean; onPress: () => unknown; borde?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={[estilos.chip, borde && estilos.chipBorde, activo && estilos.chipActivo]}
      onPress={() => {
        haptico();
        intentar(onPress);
      }}>
      <Text style={[estilos.textoChip, activo && estilos.textoChipActivo]}>{texto}</Text>
    </Pressable>
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
          onAlternar();
        }}>
        <Text style={estilos.desplegableEtiqueta}>{etiqueta}</Text>
        <Text style={[estilos.desplegableValor, vacio && estilos.desplegableVacio]} numberOfLines={1}>
          {valor}
        </Text>
        <Text style={estilos.desplegableFlecha}>{abierto ? '▴' : '▾'}</Text>
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
  boton: { padding: 14, minHeight: TOQUE_MIN, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center', justifyContent: 'center' },
  secundario: { backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.primario },
  peligro: { backgroundColor: color.peligro },
  ocupado: { opacity: 0.6 },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chip: { minHeight: TOQUE_MIN, paddingHorizontal: 14, borderRadius: 22, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  chipBorde: { borderWidth: 1, borderColor: color.borde },
  chipActivo: { backgroundColor: color.primario, borderColor: color.primario },
  textoChip: { color: color.texto, textTransform: 'none' },
  textoChipActivo: { color: '#fff', fontWeight: '600' },
});

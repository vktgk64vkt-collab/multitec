import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { haptico, intentar } from '@/accion';
import { color, tarjeta } from '@/tema';

// Zona táctil mínima recomendada por Apple y por las guías de UX.
export const TOQUE_MIN = 44;

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

const estilos = StyleSheet.create({
  etiqueta: { fontSize: 13, fontWeight: '600', color: color.suave, marginTop: 4 },
  campo: { padding: 12, minHeight: TOQUE_MIN, borderRadius: 12, backgroundColor: color.fondo, fontSize: 16, color: color.texto },
  multilinea: { minHeight: 90, textAlignVertical: 'top' },
  boton: { padding: 14, minHeight: TOQUE_MIN, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center', justifyContent: 'center' },
  secundario: { backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.primario },
  peligro: { backgroundColor: '#c0262d' },
  ocupado: { opacity: 0.6 },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chip: { minHeight: TOQUE_MIN, paddingHorizontal: 14, borderRadius: 22, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  chipBorde: { borderWidth: 1, borderColor: color.borde },
  chipActivo: { backgroundColor: color.primario, borderColor: color.primario },
  textoChip: { color: color.texto, textTransform: 'none' },
  textoChipActivo: { color: '#fff', fontWeight: '600' },
});

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { color, tarjeta } from '@/tema';

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
      multiline={multilinea}
      {...resto}
      style={[estilos.campo, multilinea && estilos.multilinea, style]}
    />
  );
}

export function Boton({
  texto,
  onPress,
  tipo = 'primario',
}: {
  texto: string;
  onPress: () => void;
  tipo?: 'primario' | 'secundario' | 'peligro';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[estilos.boton, tipo === 'secundario' && estilos.secundario, tipo === 'peligro' && estilos.peligro]}
      onPress={onPress}>
      <Text style={[estilos.textoBoton, tipo === 'secundario' && { color: color.primario }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  etiqueta: { fontSize: 13, fontWeight: '600', color: color.suave, marginTop: 4 },
  campo: { padding: 12, borderRadius: 12, backgroundColor: color.fondo, fontSize: 16, color: color.texto },
  multilinea: { minHeight: 90, textAlignVertical: 'top' },
  boton: { padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' },
  secundario: { backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.primario },
  peligro: { backgroundColor: '#c0262d' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

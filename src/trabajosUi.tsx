import { Alert as AlertNativo, StyleSheet, View } from 'react-native';

import { Alert } from '@/alert';
import { etiquetaTrabajo, GENERAL, limpiarTrabajo, trabajosDistintos } from '@/trabajos';
import { Chip, Etiqueta } from '@/ui';

/**
 * Elige el trabajo (alarma, cámaras, portón...) al que se agrega lo que sigue.
 * `valor`: undefined = Auto (el que le toca al equipo por su categoría), '' = General, o el nombre del trabajo.
 */
export function SelectorTrabajo({ trabajos, valor, onElegir }: { trabajos: string[]; valor: string | undefined; onElegir: (v: string | undefined) => void }) {
  const lista = trabajosDistintos([...trabajos, valor]);
  return (
    <View style={estilos.bloque}>
      <Etiqueta>Trabajo (Auto = según el tipo de equipo)</Etiqueta>
      <View style={estilos.chips}>
        <Chip texto="Auto" activo={valor === undefined} onPress={() => onElegir(undefined)} />
        {lista.map((t) => (
          <Chip key={t} texto={t} activo={valor?.toLowerCase() === t.toLowerCase()} onPress={() => onElegir(t)} />
        ))}
        {lista.length > 0 ? <Chip texto={GENERAL} activo={valor === ''} onPress={() => onElegir('')} /> : null}
        <Chip borde texto="+ Nuevo" onPress={() => pedirTrabajoNuevo((t) => onElegir(t))} />
      </View>
    </View>
  );
}

/** Pide el nombre de un trabajo nuevo (el teclado de iOS). */
export function pedirTrabajoNuevo(alElegir: (trabajo: string) => void) {
  AlertNativo.prompt('Nuevo trabajo', 'Por ejemplo: Alarma, Cámaras, Portón eléctrico', (texto) => {
    const t = limpiarTrabajo(texto);
    if (t) alElegir(t);
  });
}

/** Pregunta a qué trabajo pasar una línea. `null` = General. */
export function elegirTrabajoDe(descripcion: string, trabajos: string[], actual: string | null, alElegir: (trabajo: string | null) => void) {
  const otros = trabajos.filter((t) => t.toLowerCase() !== (actual ?? '').toLowerCase());
  Alert.alert('Mover a otro trabajo', descripcion, [
    ...otros.map((t) => ({ text: t, onPress: () => alElegir(t) })),
    ...(actual ? [{ text: GENERAL, onPress: () => alElegir(null) }] : []),
    { text: 'Nuevo trabajo…', onPress: () => pedirTrabajoNuevo((t) => alElegir(t)) },
    { text: 'Cancelar', style: 'cancel' as const },
  ]);
}

export { etiquetaTrabajo };

const estilos = StyleSheet.create({
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

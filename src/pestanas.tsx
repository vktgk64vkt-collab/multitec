import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonDictado } from '@/dictado';
import { BotonMenu } from '@/menu';
import { color } from '@/tema';

/**
 * Marco de las pantallas de la barra de abajo: título grande a la izquierda y el botón flotante del menú arriba a la
 * derecha. El título deja libre ese rincón para que nunca se tapen.
 */
export function PantallaTab({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={estilos.pantalla}>
      <View style={[estilos.cabecera, { paddingTop: top + 12 }]}>
        <Text style={estilos.titulo} accessibilityRole="header">
          {titulo}
        </Text>
        {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
      </View>
      {children}
      <BotonMenu />
      <BotonDictado sobreBarra />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  cabecera: { paddingHorizontal: 16, paddingRight: 72, paddingBottom: 8 },
  titulo: { fontSize: 32, fontWeight: '800', color: color.texto },
  subtitulo: { fontSize: 14, color: color.suave, marginTop: 2 },
});

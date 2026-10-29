import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { alCambiarAvisos, borrarAvisos, leerAvisos, marcarVistos, textoParaCorregir, type Aviso } from '@/avisos';
import { color } from '@/tema';
import { Boton, Etiqueta, Tarjeta } from '@/ui';

/** Avisos: todo lo que falló en la app, cada fallo con su código para poder corregirlo. */
export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const cargar = useCallback(() => leerAvisos().then(setAvisos), []);

  useEffect(() => {
    cargar().then(marcarVistos);
    return alCambiarAvisos(() => void cargar());
  }, [cargar]);

  const compartir = (texto: string) => Share.share({ message: texto });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Avisos' }} />
      <Text style={estilos.suave}>
        Cuando algo falla, queda aquí con un código (E-XXXX). Toca «Compartir» y mándame el texto: con él puedo ubicar y corregir el fallo.
      </Text>
      {avisos.length === 0 ? <Text style={estilos.vacio}>Sin fallos registrados.</Text> : null}
      {avisos.map((a) => (
        <Tarjeta key={a.codigo}>
          <View style={estilos.fila}>
            <Text style={estilos.codigo}>{a.codigo}</Text>
            <Text style={estilos.suave}>
              {a.veces} {a.veces === 1 ? 'vez' : 'veces'} · {new Date(a.ultima).toLocaleString()}
            </Text>
          </View>
          <Text style={estilos.mensaje}>{a.mensaje}</Text>
          <Etiqueta>Dónde: {a.origen}</Etiqueta>
          <Boton tipo="secundario" icono="square.and.arrow.up" texto="Compartir para corregir" onPress={() => compartir(textoParaCorregir(a))} />
        </Tarjeta>
      ))}
      {avisos.length > 0 ? (
        <>
          <Boton texto="Compartir todos" onPress={() => compartir(avisos.map(textoParaCorregir).join('\n\n---\n\n'))} />
          <Boton
            tipo="peligro"
            texto="Borrar la lista"
            onPress={() =>
              Alert.alert('Borrar avisos', '¿Borrar la lista de fallos?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Borrar', style: 'destructive', onPress: () => void borrarAvisos() },
              ])
            }
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codigo: { fontSize: 20, fontWeight: '700', color: color.peligro },
  mensaje: { fontSize: 15, color: color.texto },
  suave: { fontSize: 13, color: color.suave },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
});

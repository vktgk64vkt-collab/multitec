import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ejecucionIniciada } from '@/db/ejecucion';
import { color } from '@/tema';
import { Boton } from '@/ui';

/**
 * Una vez que la ejecución empezó, lo que se factura sale de ella: cambiar la cotización o el levantamiento ya no llega a la factura.
 * Las pantallas de cotización, levantamiento y dictado usan esto para llevar los cambios a la ejecución en vez de perderlos.
 */
export function useEjecucionIniciada(proyectoId: number | null) {
  const db = useSQLiteContext();
  const [iniciada, setIniciada] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (proyectoId === null) return;
      ejecucionIniciada(db, proyectoId).then(setIniciada);
    }, [db, proyectoId])
  );
  return iniciada;
}

export function AvisoEjecucion({ proyectoId }: { proyectoId: number }) {
  return (
    <View style={estilos.centro}>
      <Text style={estilos.titulo}>Esta cotización ya fue aprobada</Text>
      <Text style={estilos.texto}>
        Lo que se factura sale de la Ejecución. Agrega, quita o cambia equipos ahí, así no se pierde ningún cambio.
      </Text>
      <Boton texto="Abrir ejecución" onPress={() => router.replace({ pathname: '/ejecucion', params: { proyecto: proyectoId } })} />
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', gap: 12, padding: 24, backgroundColor: color.fondo },
  titulo: { fontSize: 20, fontWeight: '700', color: color.texto, textAlign: 'center' },
  texto: { fontSize: 15, color: color.suave, textAlign: 'center' },
});

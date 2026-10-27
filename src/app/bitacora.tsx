import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Alert } from '@/alert';
import { crearEntrada, eliminarEntrada, listarEntradas, type Entrada } from '@/db/bitacora';
import { formatearFecha } from '@/dinero';
import { FilaDeslizable } from '@/deslizar';
import { color } from '@/tema';
import { Boton, Campo, Tarjeta, PROPS_TECLADO } from '@/ui';

export default function Bitacora() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [texto, setTexto] = useState('');

  const cargar = useCallback(() => listarEntradas(db, proyectoId).then(setEntradas), [db, proyectoId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar() {
    if (!texto.trim()) return Alert.alert('Falta el texto', 'Escribe qué pasó antes de guardar.');
    await crearEntrada(db, proyectoId, texto.trim());
    setTexto('');
    cargar();
  }

  function confirmarEliminar(e: Entrada) {
    Alert.alert('Eliminar entrada', '¿Eliminar esta entrada de la bitácora?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarEntrada(db, e.id);
          cargar();
        },
      },
    ]);
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Bitácora' }} />
      <Tarjeta>
        <Campo
          placeholder="¿Qué se hizo hoy? Visitas, avances, pendientes..."
          value={texto}
          onChangeText={setTexto}
          multilinea
        />
        <Boton texto="Agregar entrada" onPress={agregar} />
      </Tarjeta>

      {entradas.length === 0 && <Text style={estilos.vacio}>Aún no hay entradas. Anota aquí cada visita y avance.</Text>}
      {entradas.map((e) => (
        <FilaDeslizable key={e.id} onAccion={() => confirmarEliminar(e)}>
          <Tarjeta style={{ gap: 2 }}>
            <Text style={estilos.fecha}>{formatearFecha(e.creado_en, true)}</Text>
            <Text style={estilos.nota}>{e.texto}</Text>
          </Tarjeta>
        </FilaDeslizable>
      ))}
      {entradas.length > 0 && <Text style={estilos.pista}>Desliza una entrada hacia la izquierda para eliminarla.</Text>}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fecha: { fontSize: 12, color: color.suave },
  nota: { fontSize: 16, color: color.texto },
  vacio: { textAlign: 'center', color: color.suave, marginVertical: 8 },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
});

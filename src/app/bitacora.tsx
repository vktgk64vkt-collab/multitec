import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Alert } from '@/alert';
import { crearEntrada, eliminarEntrada, listarEntradas, type Entrada } from '@/db/bitacora';

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
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Bitácora' }} />
      <TextInput
        style={[estilos.campo, estilos.texto]}
        placeholder="¿Qué se hizo hoy? Visitas, avances, pendientes..."
        value={texto}
        onChangeText={setTexto}
        multiline
      />
      <Pressable style={estilos.boton} onPress={agregar}>
        <Text style={estilos.textoBoton}>Agregar entrada</Text>
      </Pressable>

      {entradas.map((e) => (
        <Pressable key={e.id} style={estilos.fila} onLongPress={() => confirmarEliminar(e)}>
          <Text style={estilos.fecha}>{e.creado_en}</Text>
          <Text style={estilos.nota}>{e.texto}</Text>
        </Pressable>
      ))}
      {entradas.length > 0 && <Text style={estilos.pista}>Mantén presionada una entrada para eliminarla.</Text>}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  campo: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  texto: { minHeight: 90, textAlignVertical: 'top' },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fila: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#999', gap: 2 },
  fecha: { fontSize: 12, opacity: 0.5 },
  nota: { fontSize: 16 },
  pista: { fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 8 },
});

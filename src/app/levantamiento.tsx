import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Alert } from '@/alert';
import { crearPartida, eliminarPartida, listarPartidas, type Partida } from '@/db/levantamiento';
import { guardarFoto, uriFoto } from '@/fotos';

export default function Levantamiento() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [area, setArea] = useState('');
  const [equipo, setEquipo] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);

  const cargar = useCallback(() => listarPartidas(db, proyectoId).then(setPartidas), [db, proyectoId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function tomarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) return Alert.alert('Sin permiso', 'Activa la cámara en Ajustes para tomar fotos.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) setFoto(r.assets[0].uri);
  }

  async function agregar() {
    const n = Number(cantidad);
    if (!area.trim() || !equipo.trim() || !Number.isInteger(n) || n < 1) {
      return Alert.alert('Faltan datos', 'Área, equipo y una cantidad entera mayor a 0.');
    }
    await crearPartida(db, proyectoId, {
      area: area.trim(),
      equipo: equipo.trim(),
      cantidad: n,
      notas: notas.trim() || null,
      foto_uri: foto ? guardarFoto(foto) : null,
    });
    setEquipo('');
    setCantidad('1');
    setNotas('');
    setFoto(null);
    cargar();
  }

  function confirmarEliminar(p: Partida) {
    Alert.alert('Eliminar partida', `¿Eliminar ${p.equipo}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarPartida(db, p.id);
          cargar();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Levantamiento' }} />
      <TextInput style={estilos.campo} placeholder="Área (ej. Entrada, Bodega)" value={area} onChangeText={setArea} />
      <TextInput style={estilos.campo} placeholder="Equipo (ej. Cámara domo 4MP)" value={equipo} onChangeText={setEquipo} />
      <TextInput style={estilos.campo} placeholder="Cantidad" keyboardType="number-pad" value={cantidad} onChangeText={setCantidad} />
      <TextInput style={estilos.campo} placeholder="Notas" value={notas} onChangeText={setNotas} multiline />
      {foto && <Image source={{ uri: foto }} style={estilos.foto} />}
      <Pressable style={[estilos.boton, estilos.secundario]} onPress={tomarFoto}>
        <Text style={estilos.textoSecundario}>{foto ? 'Cambiar foto' : 'Tomar foto'}</Text>
      </Pressable>
      <Pressable style={estilos.boton} onPress={agregar}>
        <Text style={estilos.textoBoton}>Agregar partida</Text>
      </Pressable>

      <Text style={estilos.etiqueta}>Partidas ({partidas.length})</Text>
      {partidas.map((p) => (
        <Pressable key={p.id} style={estilos.fila} onLongPress={() => confirmarEliminar(p)}>
          <View style={estilos.filaTexto}>
            <Text style={estilos.nombre}>
              {p.cantidad} × {p.equipo}
            </Text>
            <Text style={estilos.detalle}>{p.area}</Text>
            {p.notas ? <Text style={estilos.detalle}>{p.notas}</Text> : null}
          </View>
          {p.foto_uri ? <Image source={{ uri: uriFoto(p.foto_uri) }} style={estilos.miniatura} /> : null}
        </Pressable>
      ))}
      {partidas.length > 0 && <Text style={estilos.pista}>Mantén presionada una partida para eliminarla.</Text>}
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
  foto: { width: '100%', height: 180, borderRadius: 10 },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#12292d' },
  textoSecundario: { color: '#12292d', fontSize: 16, fontWeight: '600' },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 12 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999',
  },
  filaTexto: { flex: 1 },
  nombre: { fontSize: 16, fontWeight: '600' },
  detalle: { fontSize: 14, opacity: 0.7, marginTop: 2 },
  miniatura: { width: 56, height: 56, borderRadius: 8 },
  pista: { fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 8 },
});

import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { registrarAviso } from '@/avisos';
import { exportarRespaldo, guardarRespaldoEn, restaurarFotos, restaurarRespaldo, type Avance, type ResultadoRespaldo } from '@/respaldo';
import { color } from '@/tema';

export default function Respaldo() {
  const db = useSQLiteContext();

  const [progreso, setProgreso] = useState<{ texto: string } | null>(null);
  const [barra] = useState(() => new Animated.Value(0));
  const avance: Avance = (texto, fraccion) => {
    setProgreso({ texto });
    Animated.timing(barra, { toValue: fraccion, duration: 250, useNativeDriver: false }).start();
  };

  /** Corre el respaldo con la ventana de progreso y, al terminar bien, dice qué se guardó. */
  async function conProgreso(origen: string, hacer: (a: Avance) => Promise<ResultadoRespaldo | false | null>) {
    barra.setValue(0);
    setProgreso({ texto: 'Empezando…' });
    try {
      const r = await hacer(avance);
      setProgreso(null);
      if (r === false) return Alert.alert('No disponible', 'El respaldo solo funciona en el iPhone.');
      if (r) {
        const kb = Math.max(1, Math.round(r.bytes / 1024));
        Alert.alert('Respaldo finalizado con éxito ✓', `${r.nombre}
${kb} KB${r.fotos ? ` · ${r.fotos} fotos` : ''}`);
      }
    } catch (e) {
      setProgreso(null);
      Alert.alert('No se pudo guardar el respaldo', `${String(e)}

Código: ${registrarAviso(e, origen)}`);
    }
  }

  const guardar = () => conProgreso('respaldo.guardar', (a) => guardarRespaldoEn(db, a));
  const exportar = () => conProgreso('respaldo.compartir', (a) => exportarRespaldo(db, a));

  async function fotos() {
    try {
      const n = await restaurarFotos();
      if (n !== null) Alert.alert('Listo', n === 0 ? 'La carpeta no tenía fotos.' : `Se devolvieron ${n} fotos.`);
    } catch (e) {
      Alert.alert('No se pudieron restaurar las fotos', `${String(e)}

Código: ${registrarAviso(e, 'respaldo.fotos')}`);
    }
  }

  async function elegirRestaurar() {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    Alert.alert('Restaurar respaldo', 'Esto reemplaza TODOS los datos actuales por los del archivo. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        style: 'destructive',
        onPress: async () => {
          try {
            await restaurarRespaldo(db, r.assets[0].uri);
            Alert.alert('Listo', 'Datos restaurados.');
          } catch (e) {
            Alert.alert('No se pudo restaurar', `${String(e)}

Código: ${registrarAviso(e, 'respaldo.restaurar')}`);
          }
        },
      },
    ]);
  }

  return (
    <View style={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Respaldo' }} />
      <Modal visible={progreso !== null} transparent animationType="fade">
        <View style={estilos.velo}>
          <View style={estilos.caja}>
            <ActivityIndicator color={color.primario} size="large" />
            <Text style={estilos.cajaTitulo}>Haciendo el respaldo…</Text>
            <Text style={estilos.texto}>{progreso?.texto}</Text>
            <View style={estilos.pista}>
              <Animated.View style={[estilos.relleno, { width: barra.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
          </View>
        </View>
      </Modal>
      <Text style={estilos.texto}>
        Guarda una copia de clientes, proyectos, cotizaciones, facturas y bitácora. Elige la carpeta donde guardarla (Archivos, iCloud Drive o el iPhone) y toca «Abrir» arriba a la derecha: en iPhone ese es el botón de guardar aquí. O compártela con «Guardar en Archivos», AirDrop o correo.
        Las fotos van en una carpeta junto al respaldo; para recuperarlas, restaura el respaldo y luego devuélvelas desde esa carpeta.
      </Text>
      <Pressable accessibilityRole="button" style={estilos.boton} onPress={guardar}>
        <Text style={estilos.textoBoton}>Guardar respaldo con fotos en una carpeta</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={[estilos.boton, estilos.secundario]} onPress={exportar}>
        <Text style={[estilos.textoBoton, { color: color.primario }]}>Compartir (AirDrop, correo...)</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={[estilos.boton, estilos.secundario]} onPress={fotos}>
        <Text style={[estilos.textoBoton, { color: color.primario }]}>Devolver las fotos desde una carpeta</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={[estilos.boton, estilos.peligro]} onPress={elegirRestaurar}>
        <Text style={estilos.textoBoton}>Restaurar desde archivo</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 15, color: color.suave },
  boton: { padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' },
  secundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.primario },
  peligro: { backgroundColor: color.peligro },
  velo: { flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 32 },
  caja: { width: '100%', maxWidth: 340, padding: 24, borderRadius: 18, backgroundColor: color.tarjeta, alignItems: 'center', gap: 12 },
  cajaTitulo: { fontSize: 18, fontWeight: '700', color: color.texto },
  pista: { width: '100%', height: 8, borderRadius: 4, backgroundColor: color.fondo, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: 4, backgroundColor: color.ok },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

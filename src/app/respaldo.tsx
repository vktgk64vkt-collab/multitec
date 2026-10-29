import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { registrarAviso } from '@/avisos';
import { exportarRespaldo, guardarRespaldoEn, restaurarFotos, restaurarRespaldo } from '@/respaldo';
import { color } from '@/tema';

export default function Respaldo() {
  const db = useSQLiteContext();

  async function guardar() {
    try {
      if (await guardarRespaldoEn(db)) Alert.alert('Listo', 'El respaldo se guardó en la carpeta que elegiste.');
    } catch (e) {
      Alert.alert('No se pudo guardar', `${String(e)}

Código: ${registrarAviso(e, 'respaldo.guardar')}`);
    }
  }

  async function exportar() {
    try {
      if (!(await exportarRespaldo(db))) Alert.alert('No disponible', 'El respaldo solo funciona en el iPhone.');
    } catch (e) {
      Alert.alert('No se pudo compartir', `${String(e)}

Código: ${registrarAviso(e, 'respaldo.compartir')}`);
    }
  }

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
      <Text style={estilos.texto}>
        Guarda una copia de clientes, proyectos, cotizaciones, facturas y bitácora. Elige la carpeta donde guardarla (Archivos, iCloud Drive o el iPhone), o compártela por AirDrop o correo.
        Las fotos van en una carpeta junto al respaldo; para recuperarlas, restaura el respaldo y luego devuélvelas desde esa carpeta.
      </Text>
      <Pressable accessibilityRole="button" style={estilos.boton} onPress={guardar}>
        <Text style={estilos.textoBoton}>Guardar respaldo en una carpeta</Text>
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
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

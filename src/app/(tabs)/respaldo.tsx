import * as DocumentPicker from 'expo-document-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Alert } from '@/alert';
import { exportarRespaldo, restaurarRespaldo } from '@/respaldo';
import { color } from '@/tema';

export default function Respaldo() {
  const db = useSQLiteContext();
  const { top } = useSafeAreaInsets();

  async function exportar() {
    try {
      if (!(await exportarRespaldo(db))) Alert.alert('No disponible', 'El respaldo solo funciona en el iPhone.');
    } catch (e) {
      Alert.alert('No se pudo exportar', String(e));
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
            Alert.alert('No se pudo restaurar', String(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={[estilos.contenedor, { paddingTop: top + 12 }]}>
      <Text style={estilos.titulo}>Respaldo</Text>
      <Text style={estilos.texto}>
        Guarda una copia de clientes, proyectos, cotizaciones, facturas y bitácora. Envíala a Archivos, AirDrop o correo.
        Las fotos no van incluidas.
      </Text>
      <Pressable style={estilos.boton} onPress={exportar}>
        <Text style={estilos.textoBoton}>Exportar respaldo</Text>
      </Pressable>
      <Pressable style={[estilos.boton, estilos.peligro]} onPress={elegirRestaurar}>
        <Text style={estilos.textoBoton}>Restaurar desde archivo</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, padding: 16, gap: 12, backgroundColor: color.fondo },
  titulo: { fontSize: 32, fontWeight: '800', color: color.texto },
  texto: { fontSize: 15, color: color.suave },
  boton: { padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' },
  peligro: { backgroundColor: '#c0262d' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// Foto para Claude (factura de proveedor, foto del sitio): se toma o se elige y sale en base64, comprimida.
import * as ImagePicker from 'expo-image-picker';

import { Alert } from './alert';
import type { Imagen } from './ia';

/** null si el usuario cancela o niega el permiso (en ese caso se le explica cómo darlo). */
export async function tomarImagen(origen: 'camara' | 'galeria'): Promise<Imagen | null> {
  if (origen === 'camara') {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Falta el permiso', 'Activa la cámara para Tekhnia en Ajustes del iPhone, o elige una foto de tu galería.');
      return null;
    }
  }
  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, exif: false };
  const r = origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
  const base64 = r.canceled ? null : r.assets[0]?.base64;
  return base64 ? { base64, mime: 'image/jpeg' } : null;
}

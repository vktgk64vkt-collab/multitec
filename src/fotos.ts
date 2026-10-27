import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Se guarda solo la ruta relativa: la carpeta de la app en iOS cambia entre actualizaciones.
// En web no hay sistema de archivos, se conserva la URI tal cual.
export function guardarFoto(uri: string): string {
  if (Platform.OS === 'web') return uri;
  const carpeta = new Directory(Paths.document, 'fotos');
  carpeta.create({ idempotent: true, intermediates: true });
  const nombre = `${Date.now()}.jpg`;
  new File(uri).copy(new File(carpeta, nombre));
  return `fotos/${nombre}`;
}

export function uriFoto(guardada: string): string {
  return guardada.includes(':') ? guardada : new File(Paths.document, guardada).uri;
}

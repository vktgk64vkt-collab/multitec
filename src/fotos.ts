import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Se guarda solo la ruta relativa: la carpeta de la app en iOS cambia entre actualizaciones.
// En web no hay sistema de archivos, se conserva la URI tal cual.
export function guardarFoto(uri: string): string {
  if (Platform.OS === 'web') return uri;
  const carpeta = new Directory(Paths.document, 'fotos');
  carpeta.create({ idempotent: true, intermediates: true });
  const nombre = `${Date.now()}.jpg`;
  new File(uri).copySync(new File(carpeta, nombre));
  return `fotos/${nombre}`;
}

/** Borra del teléfono los archivos de estas fotos (rutas guardadas). Un archivo que ya no está no es un error. */
export function borrarFotos(guardadas: (string | null | undefined)[]) {
  if (Platform.OS === 'web') return;
  for (const g of guardadas) {
    if (!g || g.includes(':')) continue;
    try {
      const f = new File(Paths.document, g);
      if (f.exists) f.delete();
    } catch {
      // se queda el archivo; no vale la pena fallar por eso
    }
  }
}

export function uriFoto(guardada: string): string {
  return guardada.includes(':') ? guardada : new File(Paths.document, guardada).uri;
}

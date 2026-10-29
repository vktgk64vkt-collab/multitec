import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Registro de fallos de la app. Cada fallo recibe un código (E-XXXX) que depende de dónde y por qué falló, así que el
// mismo error siempre tiene el mismo código. Se guarda en un archivo JSON (no en la base de datos: debe poder escribirse
// aunque la base sea lo que falló). Pásame el código y el detalle copiado de la pantalla Avisos para corregirlo.

export interface Aviso {
  codigo: string;
  mensaje: string;
  detalle: string; // pila de llamadas recortada
  origen: string; // acción o pantalla donde ocurrió
  veces: number;
  ultima: string; // ISO
  visto: boolean;
}

const MAX_AVISOS = 50;
const archivo = () => new File(Paths.document, 'avisos.json');
let cola: Promise<unknown> = Promise.resolve();
const escuchas = new Set<() => void>();

/** Código estable: mismo origen + mismo mensaje (sin números ni ids) = mismo código. */
export function codigoDe(origen: string, mensaje: string) {
  const base = `${origen}|${mensaje.replace(/\d+/g, '#')}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return `E-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}`;
}

export async function leerAvisos(): Promise<Aviso[]> {
  if (Platform.OS === 'web') return [];
  try {
    const f = archivo();
    return f.exists ? (JSON.parse(await f.text()) as Aviso[]) : [];
  } catch {
    return [];
  }
}

async function escribir(lista: Aviso[]) {
  const f = archivo();
  if (!f.exists) f.create();
  f.write(JSON.stringify(lista.slice(0, MAX_AVISOS)));
  escuchas.forEach((fn) => fn());
}

/** Anota un fallo sin lanzar nunca: registrar no puede ser otro motivo de fallo. Devuelve el código. */
export function registrarAviso(error: unknown, origen = 'app'): string {
  const e = error instanceof Error ? error : new Error(String(error));
  const codigo = codigoDe(origen, e.message);
  if (Platform.OS === 'web') return codigo;
  cola = cola
    .then(async () => {
      const lista = await leerAvisos();
      const previo = lista.find((a) => a.codigo === codigo);
      const ahora = new Date().toISOString();
      if (previo) {
        previo.veces += 1;
        previo.ultima = ahora;
        previo.visto = false;
        lista.sort((a, b) => b.ultima.localeCompare(a.ultima));
      } else {
        const detalle = (e.stack ?? '').split('\n').slice(0, 8).join('\n');
        lista.unshift({ codigo, mensaje: e.message, detalle, origen, veces: 1, ultima: ahora, visto: false });
      }
      await escribir(lista);
    })
    .catch(() => undefined);
  return codigo;
}

export async function marcarVistos() {
  const lista = await leerAvisos();
  if (lista.some((a) => !a.visto)) await escribir(lista.map((a) => ({ ...a, visto: true })));
}

export async function borrarAvisos() {
  await escribir([]);
}

export async function contarNuevos() {
  return (await leerAvisos()).filter((a) => !a.visto).length;
}

export function alCambiarAvisos(fn: () => void) {
  escuchas.add(fn);
  return () => void escuchas.delete(fn);
}

/** Texto listo para pegarme: código, dónde, qué y la pila. */
export function textoParaCorregir(a: Aviso) {
  return `Código ${a.codigo} (${a.veces} ${a.veces === 1 ? 'vez' : 'veces'}, última ${a.ultima})\nDónde: ${a.origen}\nError: ${a.mensaje}\n${a.detalle}`;
}

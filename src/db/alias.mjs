// Permite que las pruebas importen el código real de la app en Node: resuelve el alias "@/" y los imports sin extensión.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as rutaDe } from 'node:path';

const SRC = rutaDe(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONES = ['.ts', '.tsx', '/index.ts'];

const buscar = (base) => (existsSync(base) && !base.endsWith('/') && /\.\w+$/.test(base) ? base : EXTENSIONES.map((e) => base + e).find(existsSync));

export async function resolve(especificador, contexto, siguiente) {
  let base;
  if (especificador.startsWith('@/')) base = rutaDe(SRC, especificador.slice(2));
  else if (especificador.startsWith('.') && contexto.parentURL?.startsWith('file:')) base = rutaDe(dirname(fileURLToPath(contexto.parentURL)), especificador);
  const archivo = base && buscar(base);
  return siguiente(archivo ? pathToFileURL(archivo).href : especificador, contexto);
}

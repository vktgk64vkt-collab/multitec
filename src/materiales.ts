export type Canalizacion = 'EMT' | 'PVC';

/** Diámetros comerciales de 1/2" a 2". */
export const DIAMETROS = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2'] as const;
export type Diametro = (typeof DIAMETROS)[number];

export const DESPERDICIO = 0.1;
export const ABRAZADERA_CADA_M = 1.5;
// shortcut: tubo fijo de 3 m para todos los diámetros, cambiar si un suplidor vende otro largo
export const LARGO_TUBO_M = 3;
export const TUBOS_ENTRE_REGISTROS = 5; // un registro de paso cada 5 tubos
export const FIJACIONES_POR_REGISTRO = 2; // tornillos y tarugos con que se fija cada registro (editable en la lista antes de agregar)

/** Registros cuadrados de uso general. */
export const REGISTROS = ['2x4', '4x4', '5x5'] as const;
/** Medidas NEMA de fábrica (el usuario las edita en la pantalla). */
export const NEMA_MEDIDAS = ['6x6', '8x8', '10x10', '12x12', '14x14', '16x16', '18x18', '20x20'];
export const NEMA_TIPOS = ['1', '3'] as const;

/** Letras (conduletas) y por cuántas entradas de tubo lleva cada una (cada entrada, un conector). */
export const LETRAS = { LB: 2, LL: 2, LR: 2, C: 2, T: 3, E: 1, X: 4 } as const;
export type Letra = keyof typeof LETRAS;

export interface RegistroPedido {
  /** "2x4", "4x4", "5x5" o "NEMA 1 12x12" / "NEMA 3 12x12" */
  modelo: string;
  funcion: 'paso' | 'final';
  cantidad: number;
}

export interface PedidoMateriales {
  tipo: Canalizacion;
  diametro: Diametro;
  metros: number;
  /** Esquinas interiores: el tubo EMT se dobla, sin accesorio. En PVC llevan codo. */
  esquinasInteriores?: number;
  /** Esquinas exteriores: en EMT llevan letra o registro (según `exterior`); en PVC, codo. */
  esquinasExteriores?: number;
  exterior?: 'letra' | 'registro';
  letraEsquina?: Letra;
  /** Modelo de los registros de paso automáticos (uno cada 5 tubos) y de los de esquina. */
  modeloPaso?: string;
  /** Modelo de los registros de inicio y de final (uno de cada uno por tubería). */
  modeloExtremos?: string;
  /** Registros que el usuario agrega a mano: de paso (2 conectores) o de inicio/final extra (1 conector). */
  registros?: RegistroPedido[];
  letras?: Partial<Record<Letra, number>>;
}

export interface Material {
  /** Identifica la fila en la lista de preselección. */
  clave: string;
  descripcion: string;
  cantidad: number;
  grupo: 'Tubería' | 'Accesorios' | 'Registros' | 'Letras' | 'Fijación';
  /** Para encontrarlo en el inventario: todas estas palabras, al menos una de `alguna`, ninguna de `excluir`. */
  todas: string[];
  alguna?: string[];
  excluir?: string[];
  diametro?: Diametro;
  /** Medida del registro ("2x4"), sin espacios. */
  medida?: string;
  /** Letra (LB, LL...), como palabra completa. */
  letra?: string;
}

const entero = (n: number | undefined, defecto: number) => (n !== undefined && Number.isFinite(n) && n >= 0 ? Math.floor(n) : defecto);

/**
 * Todo lo que lleva una canalización de `metros`, con 10 % de sobrante:
 * - tubos de 3 m; un registro de inicio y uno de final (1 conector cada uno); un registro de paso cada 5 tubos; un coupling por cada empalme entre dos tubos (el empalme donde va un registro no lleva coupling);
 * - abrazadera cada 1,5 m más la del arranque, y cada una con su tarugo y su tornillo;
 * - EMT no lleva codos: la esquina interior se dobla y la exterior lleva una letra o un registro. PVC lleva un codo por esquina;
 * - registro de paso: 2 conectores; registro de inicio o de final: 1 conector; cada registro, sus tornillos y tarugos;
 * - letras (LB, LL...): un conector por cada entrada.
 */
export function calcularMateriales(p: PedidoMateriales): Material[] {
  if (!Number.isFinite(p.metros) || p.metros <= 0) return [];
  const { tipo, diametro } = p;
  const emt = tipo === 'EMT';
  const d = `${diametro}"`;
  const tubos = Math.ceil((p.metros * (1 + DESPERDICIO)) / LARGO_TUBO_M);
  const abrazaderas = Math.ceil(p.metros / ABRAZADERA_CADA_M) + 1;
  const interiores = entero(p.esquinasInteriores, 0);
  const exteriores = entero(p.esquinasExteriores, 0);
  const conLetra = emt && (p.exterior ?? 'letra') === 'letra';
  const conRegistro = emt && !conLetra;

  const modeloPaso = p.modeloPaso ?? '4x4';
  const registros: RegistroPedido[] = (p.registros ?? []).filter((r) => r.cantidad > 0).map((r) => ({ ...r }));
  registros.push({ modelo: p.modeloExtremos ?? modeloPaso, funcion: 'final', cantidad: 2 }); // inicio + final
  const pasosAuto = Math.floor(tubos / TUBOS_ENTRE_REGISTROS) + (conRegistro ? exteriores : 0);
  if (pasosAuto > 0) registros.push({ modelo: modeloPaso, funcion: 'paso', cantidad: pasosAuto });

  const letras: Partial<Record<Letra, number>> = { ...p.letras };
  if (conLetra && exteriores > 0) {
    const l = p.letraEsquina ?? 'LB';
    letras[l] = entero(letras[l], 0) + exteriores;
  }
  const nRegistros = registros.reduce((s, r) => s + r.cantidad, 0);
  const nPaso = registros.filter((r) => r.funcion === 'paso').reduce((s, r) => s + r.cantidad, 0);
  const nFinal = nRegistros - nPaso;
  const listaLetras = (Object.keys(LETRAS) as Letra[]).map((l) => [l, entero(letras[l], 0)] as const).filter(([, n]) => n > 0);
  const entradasLetras = listaLetras.reduce((s, [l, n]) => s + n * LETRAS[l], 0);
  const fijaciones = abrazaderas + nRegistros * FIJACIONES_POR_REGISTRO;
  const codos = emt ? 0 : interiores + exteriores;

  const base = { diametro };
  const filas: Material[] = [
    { ...base, clave: 'tubo', grupo: 'Tubería', descripcion: `Tubo ${tipo} ${d} x 3 m`, cantidad: tubos, todas: ['tubo', tipo.toLowerCase()] },
    { ...base, clave: 'coupling', grupo: 'Accesorios', descripcion: `Coupling ${tipo} ${d}`, cantidad: Math.max(0, tubos - 1 - nPaso), todas: [tipo.toLowerCase()], alguna: ['coupling', 'union'] },
    { ...base, clave: 'codo', grupo: 'Accesorios', descripcion: `Codo ${tipo} ${d}`, cantidad: codos, todas: ['codo', tipo.toLowerCase()] },
    { ...base, clave: 'conector', grupo: 'Accesorios', descripcion: `Conector ${tipo} ${d}`, cantidad: nPaso * 2 + nFinal + entradasLetras, todas: ['conector', tipo.toLowerCase()] },
    { ...base, clave: 'abrazadera', grupo: 'Fijación', descripcion: `Abrazadera ${tipo} ${d}`, cantidad: abrazaderas, todas: ['abrazadera', tipo.toLowerCase()] },
    { clave: 'tarugo', grupo: 'Fijación', descripcion: 'Tarugo', cantidad: fijaciones, todas: ['tarugo'] },
    { clave: 'tornillo', grupo: 'Fijación', descripcion: 'Tornillo para abrazadera y registro', cantidad: fijaciones, todas: ['tornillo'] },
  ];
  for (const r of registros) {
    const nema = /^NEMA (\d) (.+)$/.exec(r.modelo);
    filas.push({
      clave: `registro-${r.modelo}-${r.funcion}`,
      grupo: 'Registros',
      descripcion: nema ? `Registro NEMA ${nema[1]} ${nema[2]}` : `Registro ${r.modelo}`,
      cantidad: r.cantidad,
      todas: nema ? ['registro', `nema ${nema[1]}`] : ['registro'],
      excluir: nema ? undefined : ['nema'],
      medida: nema ? nema[2] : r.modelo,
    });
  }
  for (const [l, n] of listaLetras) {
    filas.push({ ...base, clave: `letra-${l}`, grupo: 'Letras', descripcion: `Letra ${l} ${tipo} ${d}`, cantidad: n, todas: [tipo.toLowerCase()], alguna: ['letra', 'conduleta'], letra: l.toLowerCase() });
  }
  // un mismo registro en paso y en final es una sola línea de inventario
  const unidas = new Map<string, Material>();
  for (const f of filas) {
    if (f.cantidad <= 0) continue;
    const k = f.grupo === 'Registros' ? f.descripcion : f.clave;
    const previo = unidas.get(k);
    if (previo) previo.cantidad += f.cantidad;
    else unidas.set(k, { ...f });
  }
  return [...unidas.values()];
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Normaliza un nombre del inventario: sin acentos, "1 1/2" -> "1-1/2", "pulg"/comillas -> ", "4 x 4" -> "4x4". */
function normalizar(nombre: string) {
  return (
    ' ' +
    sinAcentos(nombre)
      .replace(/(\d) (\d\/\d)/g, '$1-$2')
      .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
      .replace(/''|”|“|"|pulgadas?|pulg\.?|\bin\b/g, '"') +
    ' '
  );
}

const escapar = (t: string) => t.replace(/[/\-.]/g, (c) => '\\' + c);

/** ¿El nombre del inventario es este material? ("1 1/2" no se confunde con "1/2", ni "2x4" con "12x4"). */
export function coincide(nombre: string, m: Material): boolean {
  const n = normalizar(nombre);
  if (!m.todas.every((w) => n.includes(w))) return false;
  if (m.alguna && !m.alguna.some((w) => n.includes(w))) return false;
  if (m.excluir?.some((w) => n.includes(w))) return false;
  if (m.letra && !new RegExp(`[^a-z]${m.letra}[^a-z]`).test(n)) return false;
  if (m.medida && !new RegExp(`[^\\d]${escapar(m.medida)}[^\\d]`).test(n)) return false;
  if (m.diametro && !new RegExp(`[^\\d/-]${escapar(m.diametro)}\\s?"`).test(n)) return false;
  return true;
}

/** "6x6, 8x8; 10 x 10" -> ["6x6", "8x8", "10x10"]. Lo que no sea una medida AxB se descarta. */
export function leerMedidasNema(texto: string): string[] {
  const vistas = new Set<string>();
  for (const t of texto.split(/[,;\n]/)) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(t);
    if (m) vistas.add(`${m[1].replace(',', '.')}x${m[2].replace(',', '.')}`);
  }
  return [...vistas];
}

// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/pdfHtml.check.mjs
// pdfHtml.ts importa módulos sin extensión (como el resto de la app), así que aquí se transpilan a una carpeta temporal.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const tmp = mkdtempSync(join(tmpdir(), 'pdfhtml-'));
for (const f of ['pdfHtml', 'dinero', 'marca']) {
  const fuente = readFileSync(new URL(`./${f}.ts`, import.meta.url), 'utf8');
  writeFileSync(join(tmp, `${f}.js`), ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText);
}
const { htmlDocumento } = require(join(tmp, 'pdfHtml.js'));
const { paleta, esColorHex, COLOR_BASE } = require(join(tmp, 'marca.js'));

const lineas = [
  { descripcion: 'Cámara IP Turret 4MPX', detalle: 'Visión nocturna 30 m', cantidad: 4, precio_cts: 678500, tipo: 'equipo' },
  { descripcion: 'Instalación CCTV', cantidad: 4, precio_cts: 250000, descuento_pct: 10, tipo: 'servicio' },
];
const base = { titulo: 'Cotización #12', cliente: 'Cliente', proyecto: 'Proyecto', lineas, subtotal: 100, impuesto: 18, total: 118 };
const empresa = (extra = {}) => ({ nombre: 'Mi Empresa', rnc: '1-31-00000-0', telefono: null, correo: null, direccion: null, logo_uri: null, lema: null, color: null, ...extra });

// --- paleta: un color de marca produce todos los tonos; un valor no válido cae al color base
assert.equal(esColorHex('#045883'), true);
for (const malo of ['045883', '#04588', '#04588g', 'red', '', null, undefined, '#045883;}body{display:none']) assert.equal(esColorHex(malo), false, String(malo));
assert.equal(paleta('#045883').principal, '#045883');
assert.equal(paleta('no-es-color').principal, COLOR_BASE);
assert.equal(paleta('#045883').sobrePrincipal, '#ffffff'); // oscuro: texto blanco
assert.equal(paleta('#ffe600').sobrePrincipal, '#1a1a1a'); // amarillo claro: texto oscuro, si no no se lee
assert.notEqual(paleta('#045883').suave, paleta('#045883').principal);

// --- sin perfil: documento neutro, sin ninguna marca fija ni logo
const sin = htmlDocumento(base);
assert.ok(!/multitec|tekhnia/i.test(sin), 'el documento no debe nombrar ninguna empresa fija');
assert.ok(!sin.includes('<img') && !sin.includes('class="lema"'));
assert.ok(sin.includes(COLOR_BASE) && sin.includes('Cotización') && sin.includes('#12'));
assert.ok(sin.includes('6,785.00') && sin.includes('Subtotal equipos'), 'la cotización sí muestra precios y subtotales');

// --- con perfil: nombre en texto si no hay logo, color y lema propios
const conPerfil = htmlDocumento({ ...base, negocio: empresa({ color: '#1e5aa8', lema: 'Servicios de calidad' }) });
assert.ok(conPerfil.includes('class="nombre-empresa">Mi Empresa') && !conPerfil.includes('<img'));
assert.ok(conPerfil.includes('#1e5aa8') && conPerfil.includes('Servicios de calidad') && conPerfil.includes('RNC: 1-31-00000-0'));
assert.ok(!conPerfil.includes(COLOR_BASE), 'con color propio no queda el color base');

// --- con logo: va el logo (png o jpeg según el contenido) y el nombre pasa a los datos
const png = htmlDocumento({ ...base, negocio: empresa({ logo_base64: 'iVBORw0KGgo' }) });
assert.ok(png.includes('data:image/png;base64,iVBORw0KGgo') && png.includes('<b>Mi Empresa</b>') && !png.includes('class="nombre-empresa"'));
const jpg = htmlDocumento({ ...base, negocio: empresa({ logo_base64: '/9j/AAAA' }) });
assert.ok(jpg.includes('data:image/jpeg;base64,/9j/AAAA'));

// --- un color escrito a mano nunca entra al CSS sin validar
const inyeccion = htmlDocumento({ ...base, negocio: empresa({ color: '#000;}body{display:none' }) });
assert.ok(!inyeccion.includes('display:none') && inyeccion.includes(COLOR_BASE));

// --- propuesta: alcance y total, nunca precios por artículo
const prop = htmlDocumento({ ...base, titulo: 'Propuesta #12', sinPrecios: true });
for (const prohibido of ['6,785.00', '2,500.00', '27,140.00', '10%', 'Subtotal', 'Precio', 'Importe']) {
  assert.ok(!prop.includes(prohibido), `la propuesta no debe mostrar "${prohibido}"`);
}
assert.ok(prop.includes('Cámara IP Turret 4MPX') && prop.includes('Visión nocturna 30 m') && prop.includes('Total (ITBIS incluido)'));
assert.ok(prop.includes('RD$ 1.18'));

// --- factura: NCF, pagos y saldo; el sello de anulada
const fac = htmlDocumento({ ...base, titulo: 'Factura (ANULADA)', ncf: 'B0100000001', pagos: [{ fecha: '27 oct 2026', monto_cts: 50 }] });
assert.ok(fac.includes('NCF B0100000001') && fac.includes('ANULADA') && fac.includes('Saldo pendiente: RD$ 0.68'));

// --- el texto del usuario va escapado
const xss = htmlDocumento({ ...base, cliente: '<script>alert(1)</script>', negocio: empresa({ nombre: '<b>x</b>', lema: '<i>y</i>' }) });
assert.ok(!xss.includes('<script>alert') && !xss.includes('<i>y</i>') && xss.includes('&#60;script&#62;'));

// --- líneas repetidas: una sola fila con la cantidad sumada (en cotización y en propuesta)
const dup = htmlDocumento({ ...base, lineas: [lineas[0], { ...lineas[0], cantidad: 2 }] });
assert.equal((dup.match(/Cámara IP Turret 4MPX/g) ?? []).length, 1);
assert.ok(dup.includes('<td class="n">6</td>'), 'cantidades 4 + 2 = 6');
const dupProp = htmlDocumento({ ...base, sinPrecios: true, lineas: [lineas[0], { ...lineas[0], precio_cts: 1, cantidad: 1 }] });
assert.ok(dupProp.includes('<td class="n cant">5</td>') && (dupProp.match(/Cámara IP Turret 4MPX/g) ?? []).length === 1);
// --- el área no sale en el documento: líneas antiguas "Equipo (Área)" se limpian y se suman con las nuevas
const viejas = htmlDocumento({ ...base, areas: ['Entrada', 'Bodega'], lineas: [{ ...lineas[0], descripcion: 'Cámara IP (Entrada)', cantidad: 2 }, { ...lineas[0], descripcion: 'Cámara IP (Bodega)', cantidad: 3 }, { ...lineas[0], descripcion: 'Cámara IP', cantidad: 1 }] });
assert.ok(!viejas.includes('Entrada') && !viejas.includes('Bodega'), 'el área no debe aparecer');
assert.equal((viejas.match(/Cámara IP/g) ?? []).length, 1);
assert.ok(viejas.includes('<td class="n">6</td>'), '2 + 3 + 1 = 6 en una sola fila');
console.log('pdfHtml ok');

// Ejecutar: node --experimental-strip-types src/nomenclatura.check.mjs
import assert from 'node:assert/strict';

import { armarNombre, FAMILIAS, NA, sugerenciasEspecificacion } from './nomenclatura.ts';

const p = { tipo: 'Cámara', tecnologia: 'IP', forma: 'Turret', especificacion: '4MPX', marca: 'Hikvision', modelo: 'DS-2CD2143G2-I' };
assert.equal(armarNombre(p), 'Cámara IP Turret 4MPX Hikvision DS-2CD2143G2-I');
assert.equal(armarNombre({ ...p, forma: NA, marca: 'n/a' }), 'Cámara IP 4MPX DS-2CD2143G2-I'); // N/A se omite
assert.equal(armarNombre({ ...p, modelo: '' }), null); // casilla sin responder
assert.equal(armarNombre({ ...p, tipo: NA }), null); // el tipo no puede ser N/A
assert.equal(armarNombre({ ...p, tipo: '  Cámara  ', modelo: ' X1 ' }), 'Cámara IP Turret 4MPX Hikvision X1');
assert.deepEqual(sugerenciasEspecificacion(FAMILIAS.CCTV, 'NVR'), ['4CH', '8CH', '16CH', '32CH', '64CH']);
assert.deepEqual(sugerenciasEspecificacion(FAMILIAS.CCTV, 'Soporte'), []);
assert.ok(sugerenciasEspecificacion(FAMILIAS.Cableado, 'Cable UTP').includes('305M'));
console.log('nomenclatura ok');

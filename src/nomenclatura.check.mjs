// Ejecutar: node --experimental-strip-types src/nomenclatura.check.mjs
import assert from 'node:assert/strict';

import { armarNombre, atributosDe, detalleArticulo, FAMILIAS, guardarAtributos, leerAtributos, NA, sugerenciasEspecificacion, textoCaracteristicas } from './nomenclatura.ts';

const p = { tipo: 'Cámara', tecnologia: 'IP', forma: 'Turret', especificacion: '4MPX', marca: 'Hikvision', modelo: 'DS-2CD2143G2-I' };
assert.equal(armarNombre(p), 'Cámara IP Turret 4MPX Hikvision DS-2CD2143G2-I');
assert.equal(armarNombre({ ...p, forma: NA, marca: 'n/a' }), 'Cámara IP 4MPX DS-2CD2143G2-I'); // N/A se omite
assert.equal(armarNombre({ ...p, modelo: '' }), null); // casilla sin responder
assert.equal(armarNombre({ ...p, tipo: NA }), null); // el tipo no puede ser N/A
assert.equal(armarNombre({ ...p, tipo: '  Cámara  ', modelo: ' X1 ' }), 'Cámara IP Turret 4MPX Hikvision X1');
assert.deepEqual(sugerenciasEspecificacion(FAMILIAS.CCTV, 'NVR'), ['4CH', '8CH', '16CH', '32CH', '64CH', '128CH']);
assert.deepEqual(sugerenciasEspecificacion(FAMILIAS.CCTV, 'Soporte'), []);
assert.ok(sugerenciasEspecificacion(FAMILIAS.Cableado, 'Cable UTP').includes('305M'));
// --- Epcom y NVR de 4 a 128 canales
for (const f of ['CCTV', 'Alarma', 'Control de acceso', 'Energía']) assert.ok(FAMILIAS[f].marcas.includes('Epcom'), 'Epcom en ' + f);
assert.deepEqual(sugerenciasEspecificacion(FAMILIAS.CCTV, 'NVR'), ['4CH', '8CH', '16CH', '32CH', '64CH', '128CH']);

// --- características según el tipo: solo las del equipo elegido
assert.deepEqual(atributosDe('NVR').map((a) => a.clave), ['poe', 'discos']);
assert.deepEqual(atributosDe(' nvr ').map((a) => a.clave), ['poe', 'discos']);
assert.deepEqual(atributosDe('DVR').map((a) => a.clave), ['discos']);
assert.deepEqual(atributosDe('Cámara'), []);
assert.deepEqual(atributosDe(null), []);
assert.deepEqual(atributosDe('NVR')[1].opciones, ['1', '2', '4', '8']);
assert.deepEqual(atributosDe('NVR')[0].opciones, ['Con PoE', 'Sin PoE']);

// guardar: lo que no es del tipo se descarta, lo vacío no se guarda
assert.equal(guardarAtributos('NVR', { poe: 'Con PoE', discos: '2' }), '{"poe":"Con PoE","discos":"2"}');
assert.equal(guardarAtributos('NVR', { poe: '', discos: ' 4 ' }), '{"discos":"4"}');
assert.equal(guardarAtributos('DVR', { poe: 'Con PoE', discos: '2' }), '{"discos":"2"}'); // un DVR no lleva PoE
assert.equal(guardarAtributos('Cámara', { poe: 'Con PoE' }), null);
assert.equal(guardarAtributos('NVR', {}), null);
assert.deepEqual(leerAtributos('{"poe":"Con PoE","discos":"2"}'), { poe: 'Con PoE', discos: '2' });
assert.deepEqual(leerAtributos('no es json'), {});
assert.deepEqual(leerAtributos(null), {});
assert.deepEqual(leerAtributos('[1,2]'), {});

// texto: en el orden del tipo, una sola línea
assert.equal(textoCaracteristicas('NVR', '{"discos":"4","poe":"Sin PoE"}'), 'Sin PoE · Soporta 4 discos');
assert.equal(textoCaracteristicas('NVR', '{"discos":"1"}'), 'Soporta 1 disco');
assert.equal(textoCaracteristicas('NVR', null), '');
assert.equal(textoCaracteristicas('Cámara', '{"poe":"Con PoE"}'), '');

// descripción del artículo para cotización y factura
assert.equal(detalleArticulo({ f_tipo: 'NVR', atributos: '{"poe":"Con PoE","discos":"2"}', descripcion: 'Grabación 4K' }), 'Con PoE · Soporta 2 discos\nGrabación 4K');
assert.equal(detalleArticulo({ f_tipo: 'NVR', atributos: '{"poe":"Con PoE"}', descripcion: null }), 'Con PoE');
assert.equal(detalleArticulo({ f_tipo: 'Cámara', atributos: null, descripcion: ' IP67 ' }), 'IP67');
assert.equal(detalleArticulo({ f_tipo: null, atributos: null, descripcion: null }), null);

console.log('nomenclatura ok');

// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/trabajos.check.mjs
import assert from 'node:assert/strict';

import { agruparPorTrabajo, etiquetaTrabajo, hayVariosTrabajos, limpiarTrabajo, trabajoAuto, trabajosDistintos } from './trabajos.ts';

assert.equal(etiquetaTrabajo(null), 'General');
assert.equal(etiquetaTrabajo('  '), 'General');
assert.equal(etiquetaTrabajo('Alarma'), 'Alarma');
assert.equal(limpiarTrabajo('  Portón   eléctrico '), 'Portón eléctrico');
assert.equal(limpiarTrabajo(''), null);

// el trabajo sale de la categoría del inventario; los servicios quedan sin trabajo
assert.equal(trabajoAuto('CCTV'), 'CCTV');
assert.equal(trabajoAuto('Servicios'), null);
assert.equal(trabajoAuto('servicios'), null);
assert.equal(trabajoAuto(null), null);

const l = (descripcion, trabajo) => ({ descripcion, trabajo });
const lineas = [l('Cámara', 'CCTV'), l('Panel', 'Alarma'), l('Instalación', null), l('NVR', 'cctv'), l('Sensor', 'Alarma')];
const g = agruparPorTrabajo(lineas);
assert.deepEqual(g.map((x) => [x.trabajo, x.lineas.map((y) => y.descripcion)]), [
  ['CCTV', ['Cámara', 'NVR']], // "cctv" y "CCTV" son el mismo trabajo
  ['Alarma', ['Panel', 'Sensor']],
  [null, ['Instalación']],
]);
assert.equal(hayVariosTrabajos(lineas), true);
assert.equal(hayVariosTrabajos([l('a', 'CCTV'), l('b', 'CCTV')]), false);
assert.equal(hayVariosTrabajos([l('a', null), l('b', undefined)]), false);
assert.equal(hayVariosTrabajos([l('a', 'CCTV'), l('b', null)]), true); // uno con trabajo y otro general: dos secciones

assert.deepEqual(trabajosDistintos(['Alarma', 'alarma', null, ' CCTV ', '']), ['Alarma', 'CCTV']);

console.log('trabajos ok');

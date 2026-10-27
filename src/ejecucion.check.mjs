// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/ejecucion.check.mjs
import assert from 'node:assert/strict';

import { contarCambios, textoCambio, tipoCambio } from './ejecucion.ts';

const l = (cantidad, cantidad_cotizada) => ({ cantidad, cantidad_cotizada });

assert.equal(tipoCambio(l(4, 4)), 'igual');
assert.equal(tipoCambio(l(3, 4)), 'cambio');
assert.equal(tipoCambio(l(5, 4)), 'cambio');
assert.equal(tipoCambio(l(0, 4)), 'quitado');
assert.equal(tipoCambio(l(2, 0)), 'agregado');
assert.equal(tipoCambio(l(0, 0)), 'igual'); // se agregó y se volvió a poner en cero: no cambia nada

assert.equal(textoCambio(l(4, 4)), '');
assert.equal(textoCambio(l(3, 4)), 'Cotizado 4, ahora 3');
assert.equal(textoCambio(l(0, 4)), 'Quitado');
assert.equal(textoCambio(l(2, 0)), 'Agregado');

assert.equal(contarCambios([l(4, 4), l(3, 4), l(0, 2), l(1, 0), l(0, 0)]), 3);
assert.equal(contarCambios([]), 0);

console.log('ejecucion ok');

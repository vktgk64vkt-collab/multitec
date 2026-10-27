// Ejecutar: node --experimental-strip-types src/dinero.check.mjs
import assert from 'node:assert/strict';

import { aCentavos, totales } from './dinero.ts';

assert.equal(aCentavos('12.5'), 1250);
assert.equal(aCentavos('12,99'), 1299);
assert.equal(aCentavos(''), null);
assert.equal(aCentavos('-1'), null);
assert.equal(aCentavos('abc'), null);
assert.deepEqual(totales([{ cantidad: 3, precio_cts: 1999 }], 16), { subtotal: 5997, impuesto: 960, total: 6957 });
assert.deepEqual(totales([], 18), { subtotal: 0, impuesto: 0, total: 0 });
console.log('dinero ok');

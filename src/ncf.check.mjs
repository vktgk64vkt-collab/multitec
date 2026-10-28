// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/ncf.check.mjs
import assert from 'node:assert/strict';

import { incrementarNcf } from './ncf.ts';

assert.equal(incrementarNcf('B0100000045'), 'B0100000046');
assert.equal(incrementarNcf('b0100000009'), 'B0100000010'); // minúsculas y cambio de decena
assert.equal(incrementarNcf('B0199999999'), null); // serie agotada
assert.equal(incrementarNcf('E310000000099'), 'E310000000100');
assert.equal(incrementarNcf('B0200000001'), 'B0200000002'); // conserva la serie
assert.equal(incrementarNcf('00000000'), null); // sin comprobante no sugiere nada
assert.equal(incrementarNcf(null), null);
assert.equal(incrementarNcf('ABC'), null);

console.log('ncf ok');

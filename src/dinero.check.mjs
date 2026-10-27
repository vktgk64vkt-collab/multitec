// Ejecutar: node --experimental-strip-types src/dinero.check.mjs
import assert from 'node:assert/strict';

import { aCentavos, importe, precioDesdeCosto, precioParaProyecto, preciosArticulo, totales } from './dinero.ts';

assert.equal(aCentavos('12.5'), 1250);
assert.equal(aCentavos('12,99'), 1299);
assert.equal(aCentavos(''), null);
assert.equal(aCentavos('-1'), null);
assert.equal(aCentavos('abc'), null);
assert.deepEqual(totales([{ cantidad: 3, precio_cts: 1999 }], 16), { subtotal: 5997, impuesto: 960, total: 6957 });
assert.deepEqual(totales([], 18), { subtotal: 0, impuesto: 0, total: 0 });
assert.equal(importe({ cantidad: 2, precio_cts: 1000, descuento_pct: 10 }), 1800);
assert.deepEqual(totales([{ cantidad: 2, precio_cts: 1000, descuento_pct: 10 }], 18), { subtotal: 1800, impuesto: 324, total: 2124 });
// costo 500 + 15 % + ITBIS 18 % = 678.50; + 20 % = 708.00
assert.equal(precioDesdeCosto(50000, 15), 67850);
assert.equal(precioDesdeCosto(50000, 20), 70800);
assert.deepEqual(preciosArticulo({ costo_cts: 50000, precio_cts: 0, margen1_pct: 15, margen2_pct: 17.5, margen3_pct: 20 }), [67850, 69325, 70800]);
assert.deepEqual(preciosArticulo({ costo_cts: 0, precio_cts: 1234, margen1_pct: null, margen2_pct: null, margen3_pct: null }), [1234, 1234, 1234]);
assert.equal(precioParaProyecto({ costo_cts: 50000, precio_cts: 0, margen1_pct: 15, margen2_pct: 15, margen3_pct: 15 }, 1, false), 57500);
assert.deepEqual(totales([{ cantidad: 1, precio_cts: 11800 }], 18, true), { subtotal: 10000, impuesto: 1800, total: 11800 });
console.log('dinero ok');

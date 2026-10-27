// Ejecutar: node --experimental-strip-types src/dinero.check.mjs
import assert from 'node:assert/strict';

import { sinArea, agruparLineas, fechaEn, formatear, formatearFecha, moneda, aCentavos, importe, precioDesdeCosto, precioParaProyecto, preciosArticulo, totales } from './dinero.ts';

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
// el impuesto del proyecto manda: exento (0 %) no lleva ITBIS dentro del precio
const art = { costo_cts: 50000, precio_cts: 0, margen1_pct: 15, margen2_pct: 15, margen3_pct: 15 };
assert.equal(precioParaProyecto(art, 1, true, 18), 67850);
assert.equal(precioParaProyecto(art, 1, true, 0), 57500);
assert.equal(precioParaProyecto(art, 1, false, 18), 57500);
assert.equal(precioParaProyecto({ ...art, costo_cts: 0, precio_cts: 1234, margen1_pct: null }, 2, true, 18), 1234); // precio fijo
assert.equal(moneda(150000), 'RD$ 1,500.00');
assert.equal(formatearFecha('2026-10-27 10:04:12'), '27 oct 2026');
assert.equal(formatearFecha('2026-10-27 10:04:12', true), '27 oct 2026, 10:04');
assert.equal(formatearFecha('2026-10-27'), '27 oct 2026');
assert.equal(formatearFecha(null), '');
assert.equal(fechaEn(30, new Date(2026, 0, 15)), '2026-02-14');
assert.equal(fechaEn(15, new Date(2026, 11, 20)), '2027-01-04');
assert.equal(formatear(150000), '1,500.00');
assert.equal(formatear(5), '0.05');
assert.equal(formatear(123456789), '1,234,567.89');
assert.equal(formatear(-250000), '-2,500.00');
// líneas repetidas: se suman en una sola, cada una con su precio
const A = { descripcion: 'Cámara IP', detalle: 'IP67', cantidad: 2, precio_cts: 1000, tipo: 'equipo' };
const g = agruparLineas([A, { ...A, cantidad: 3 }, { ...A, descripcion: ' cámara ip ', cantidad: 1 }, { ...A, precio_cts: 900 }, { ...A, tipo: 'servicio' }, { ...A, descuento_pct: 10 }]);
assert.deepEqual(g.map((l) => l.cantidad), [6, 2, 2, 2]); // 2+3+1 juntas; distinto precio, tipo o descuento no se juntan
assert.equal(importe(g[0]), 6000);
assert.deepEqual(agruparLineas([A, { ...A, precio_cts: 900, cantidad: 4 }], true).map((l) => l.cantidad), [6]); // propuesta: el precio no cuenta
assert.deepEqual(agruparLineas([]), []);
// áreas: solo se quita el sufijo que coincide con un área del proyecto
assert.equal(sinArea('Cámara IP (Entrada)', ['Bodega', 'entrada']), 'Cámara IP');
assert.equal(sinArea('Llavero (tag)', ['Entrada']), 'Llavero (tag)'); // paréntesis propios del nombre: no se tocan
assert.equal(sinArea('Cámara IP', ['Entrada']), 'Cámara IP');
assert.equal(sinArea('Cámara IP (Entrada) ', ['Entrada']), 'Cámara IP');
assert.equal(sinArea('Cable (Patio) (Patio)', ['Patio']), 'Cable (Patio)'); // solo el último
assert.equal(sinArea('X (Entrada)', []), 'X (Entrada)');
console.log('dinero ok');

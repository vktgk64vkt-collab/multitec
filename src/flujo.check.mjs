// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/flujo.check.mjs
import assert from 'node:assert/strict';

import { siguientePaso } from './flujo.ts';

const base = { estado: 'levantamiento', partidas: 0, lineas: 0, total_cts: 0, factura: null };
const paso = (cambio) => siguientePaso({ ...base, ...cambio });

// proyecto nuevo: empezar por el levantamiento
assert.deepEqual([paso({}).destino, paso({}).boton], ['levantamiento', 'Empezar']);
// ya hay equipos levantados pero aún no hay cotización
assert.equal(paso({ partidas: 3 }).destino, 'cotizacion');
assert.equal(paso({ partidas: 3 }).titulo, 'Arma la cotización');
// cotización con líneas: muestra el total
const lista = paso({ partidas: 3, lineas: 3, total_cts: 4702000, estado: 'cotizado' });
assert.equal(lista.destino, 'cotizacion');
assert.equal(lista.titulo, 'Cotización lista: RD$ 47,020.00');
// facturada con saldo: cobrar
const cobrar = paso({ lineas: 3, total_cts: 4702000, factura: { ncf: 'B0100000045', saldo_cts: 2351000, anulada: false } });
assert.equal(cobrar.destino, 'factura');
assert.equal(cobrar.titulo, 'Falta cobrar RD$ 23,510.00');
assert.equal(cobrar.detalle, 'Factura B0100000045');
// todo cobrado: cerrar
const cerrar = paso({ factura: { ncf: 'B0100000045', saldo_cts: 0, anulada: false }, estado: 'facturado' });
assert.deepEqual([cerrar.destino, cerrar.boton], ['cerrar', 'Cerrar proyecto']);
// anulada: no se cobra ni se cierra; se explica qué hacer
const anulada = paso({ lineas: 3, factura: { ncf: 'B0100000045', saldo_cts: 0, anulada: true } });
assert.equal(anulada.titulo, 'Factura anulada');
assert.equal(anulada.destino, 'factura');
// cerrado: no hay siguiente paso
assert.equal(paso({ estado: 'cerrado', lineas: 3 }), null);
// el estado "facturado" por sí solo no decide: manda lo que realmente hay (la factura)
assert.equal(paso({ estado: 'facturado', lineas: 2, total_cts: 100 }).destino, 'cotizacion');

console.log('flujo ok');

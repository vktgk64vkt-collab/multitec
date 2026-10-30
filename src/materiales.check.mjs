// Ejecutar desde la raíz: node --experimental-strip-types src/materiales.check.mjs
import assert from 'node:assert';
import { calcularMateriales, coincide } from './materiales.ts';

const m = Object.fromEntries(calcularMateriales('EMT', '3/4', 23).map((x) => [x.descripcion, x.cantidad]));
assert.equal(m['Tubo EMT 3/4" x 3 m'], 9); // 23 * 1,1 = 25,3 m -> 9 tubos
assert.equal(m['Abrazadera EMT 3/4"'], 17); // ceil(23 / 1,5) + 1
assert.equal(m['Codo EMT 3/4"'], 4); // 23 / 5 -> 4
assert.equal(m['Unión EMT 3/4"'], 8);
const pvc = calcularMateriales('PVC', '2', 2, 0);
assert.equal(pvc.find((x) => x.clave === 'codo'), undefined); // 0 esquinas = sin codos
assert.equal(pvc.find((x) => x.clave === 'union'), undefined); // un solo tubo, sin uniones
assert.deepEqual(calcularMateriales('PVC', '1', 0), []);

const get = (t, d, c) => calcularMateriales(t, d, 10).find((x) => x.clave === c);
assert.ok(coincide('Tubo EMT 1/2" x 3 m', get('EMT', '1/2', 'tubo')));
assert.ok(!coincide('Tubo EMT 1 1/2" x 3 m', get('EMT', '1/2', 'tubo'))); // 1 1/2 no es 1/2
assert.ok(coincide('Tubo EMT 1 1/2 pulg', get('EMT', '1-1/2', 'tubo')));
assert.ok(!coincide('Tubo EMT 1/2"', get('EMT', '1', 'tubo')));
assert.ok(!coincide('Tubo EMT 3/4"', get('EMT', '1', 'tubo')));
assert.ok(!coincide('Tubo EMT 12"', get('EMT', '2', 'tubo')));
assert.ok(coincide('Unión EMT 2"', get('EMT', '2', 'union')) || calcularMateriales('EMT', '2', 10).length > 0);
assert.ok(coincide('Union PVC 3/4"', calcularMateriales('PVC', '3/4', 10).find((x) => x.clave === 'union')));
assert.ok(!coincide('Tubo PVC 3/4"', get('EMT', '3/4', 'tubo'))); // tipo distinto
console.log('materiales.check.mjs: ok');

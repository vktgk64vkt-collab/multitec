// Ejecutar desde la raíz: node --experimental-strip-types src/materiales.check.mjs
import assert from 'node:assert';
import { calcularMateriales } from './materiales.ts';

const m = Object.fromEntries(calcularMateriales('EMT', 23).map((x) => [x.descripcion, x.cantidad]));
assert.equal(m['Tubo EMT 3 m'], 9); // 23 * 1,1 = 25,3 m -> 9 tubos
assert.equal(m['Abrazadera EMT'], 17); // ceil(23 / 1,5) + 1
assert.equal(m['Codo EMT'], 4); // 23 / 5 -> 4
assert.equal(m['Unión EMT'], 8);
assert.equal(calcularMateriales('PVC', 2, 0).find((x) => x.descripcion.startsWith('Codo')), undefined); // 0 esquinas = sin codos
assert.equal(calcularMateriales('PVC', 2, 0).find((x) => x.descripcion.startsWith('Unión')), undefined); // un solo tubo, sin uniones
assert.deepEqual(calcularMateriales('PVC', 0), []);
console.log('materiales.check.mjs: ok');

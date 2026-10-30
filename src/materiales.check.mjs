// Ejecutar desde la raíz: node --experimental-strip-types src/materiales.check.mjs
import assert from 'node:assert';
import { calcularMateriales, coincide, leerMedidasNema } from './materiales.ts';

const por = (lista) => Object.fromEntries(lista.map((x) => [x.clave, x.cantidad]));

// 30 m de EMT 3/4" con un registro de paso y uno final
const a = calcularMateriales({
  tipo: 'EMT',
  diametro: '3/4',
  metros: 30,
  registros: [
    { modelo: '4x4', funcion: 'paso', cantidad: 1 },
    { modelo: '2x4', funcion: 'final', cantidad: 1 },
  ],
});
const q = por(a);
assert.equal(q.tubo, 11); // 30 * 1,1 = 33 m -> 11 tubos
assert.equal(q.coupling, 10); // un coupling por empalme
assert.equal(q.abrazadera, 21); // ceil(30 / 1,5) + 1
assert.equal(q.codo, 6); // 30 / 5
assert.equal(q.conector, 2); // registro de paso: 2 conectores
assert.equal(q['conector-recto'], 2); // registro final: 2 conectores rectos
assert.equal(q.tarugo, 25); // 21 abrazaderas + 2 registros * 2
assert.equal(q.tornillo, 25);
assert.equal(a.find((x) => x.clave === 'registro-4x4-paso').cantidad, 1);

// sin registros ni conduletas no hay conectores
const b = por(calcularMateriales({ tipo: 'PVC', diametro: '2', metros: 2, esquinas: 0 }));
assert.equal(b.codo, undefined);
assert.equal(b.coupling, undefined); // un solo tubo
assert.equal(b.conector, undefined);
assert.deepEqual(calcularMateriales({ tipo: 'PVC', diametro: '1', metros: 0 }), []);

// conduletas: LB 2 entradas, T 3
const c = por(calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 10, conduletas: { LB: 2, T: 1 } }));
assert.equal(c['conduleta-LB'], 2);
assert.equal(c.conector, 7); // 2*2 + 3

// NEMA: modelo con tipo y medida editable; paso y final del mismo modelo se juntan
const d = calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 10, registros: [{ modelo: 'NEMA 3 12x12', funcion: 'paso', cantidad: 1 }, { modelo: 'NEMA 3 12x12', funcion: 'final', cantidad: 2 }] });
const nema = d.filter((x) => x.grupo === 'Registros');
assert.equal(nema.length, 1);
assert.equal(nema[0].cantidad, 3);
assert.equal(nema[0].descripcion, 'Registro NEMA 3 12x12');

// emparejar con el inventario
const f = (t, d2, clave, nombre) => coincide(nombre, calcularMateriales({ tipo: t, diametro: d2, metros: 10, esquinas: 1, registros: [{ modelo: '4x4', funcion: 'paso', cantidad: 1 }, { modelo: 'NEMA 1 12x12', funcion: 'final', cantidad: 1 }], conduletas: { LB: 1 } }).find((x) => x.clave === clave));
assert.ok(f('EMT', '1/2', 'tubo', 'Tubo EMT 1/2" x 3 m'));
assert.ok(!f('EMT', '1/2', 'tubo', 'Tubo EMT 1 1/2" x 3 m')); // 1 1/2 no es 1/2
assert.ok(f('EMT', '1-1/2', 'tubo', 'Tubo EMT 1 1/2 pulg'));
assert.ok(!f('EMT', '1', 'tubo', 'Tubo EMT 3/4"'));
assert.ok(!f('EMT', '3/4', 'tubo', 'Tubo PVC 3/4"')); // tipo distinto
assert.ok(f('EMT', '3/4', 'coupling', 'Coupling EMT 3/4"'));
assert.ok(f('PVC', '3/4', 'coupling', 'Unión PVC 3/4"'));
assert.ok(f('EMT', '3/4', 'conector', 'Conector EMT 3/4"'));
assert.ok(!f('EMT', '3/4', 'conector', 'Conector recto EMT 3/4"')); // el recto es otra pieza
assert.ok(f('EMT', '3/4', 'conector-recto', 'Conector recto EMT 3/4"'));
assert.ok(f('EMT', '3/4', 'registro-4x4-paso', 'Registro 4 x 4'));
assert.ok(!f('EMT', '3/4', 'registro-4x4-paso', 'Registro 14x4'));
assert.ok(!f('EMT', '3/4', 'registro-4x4-paso', 'Registro NEMA 1 4x4')); // NEMA no es un registro común
assert.ok(f('EMT', '3/4', 'registro-NEMA 1 12x12-final', 'Registro NEMA 1 12 x 12'));
assert.ok(!f('EMT', '3/4', 'registro-NEMA 1 12x12-final', 'Registro NEMA 3 12x12'));
assert.ok(f('EMT', '3/4', 'conduleta-LB', 'Conduleta LB EMT 3/4"'));
assert.ok(!f('EMT', '3/4', 'conduleta-LB', 'Conduleta LBB EMT 3/4"'));

assert.deepEqual(leerMedidasNema('6x6, 8 x 8; 10X10, basura, 12.5x12.5'), ['6x6', '8x8', '10x10', '12.5x12.5']);
console.log('materiales.check.mjs: ok');

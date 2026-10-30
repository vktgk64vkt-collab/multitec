// Ejecutar desde la raíz: node --experimental-strip-types src/materiales.check.mjs
import assert from 'node:assert';
import { calcularMateriales, coincide, leerMedidasNema } from './materiales.ts';

const por = (lista) => Object.fromEntries(lista.map((x) => [x.clave, x.cantidad]));

// 30 m de EMT 3/4": 11 tubos -> 2 registros de paso (uno cada 5 tubos) + 1 de inicio y 1 de final
const a = calcularMateriales({ tipo: 'EMT', diametro: '3/4', metros: 30 });
const q = por(a);
assert.equal(q.tubo, 11); // 30 * 1,1 = 33 m -> 11 tubos
assert.equal(a.filter((x) => x.grupo === 'Registros').length, 1); // todos 4x4: una sola línea
assert.equal(q['registro-4x4-final'], 4); // 2 de paso + inicio + final
assert.equal(q.coupling, 8); // 10 empalmes, 2 son registros de paso
assert.equal(q.abrazadera, 21); // ceil(30 / 1,5) + 1
assert.equal(q.codo, undefined); // EMT no lleva codos
assert.equal(q.conector, 6); // 2 de paso * 2 + inicio 1 + final 1
assert.equal(q['conector-recto'], undefined);
assert.equal(q.tarugo, 29); // 21 abrazaderas + 4 registros * 2
assert.equal(q.tornillo, 29);

// modelos distintos para extremos y paso
const m = calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 30, modeloPaso: '5x5', modeloExtremos: 'NEMA 1 12x12' });
assert.equal(por(m)['registro-5x5-paso'], 2);
assert.equal(por(m)['registro-NEMA 1 12x12-final'], 2);

// menos de 5 tubos: sin registros de paso, pero siempre inicio y final
const corto = por(calcularMateriales({ tipo: 'EMT', diametro: '1/2', metros: 10 }));
assert.equal(corto.tubo, 4);
assert.equal(corto['registro-4x4-final'], 2);
assert.equal(corto.conector, 2);
assert.equal(corto.coupling, 3);

// esquinas en EMT: interiores sin accesorio; exteriores con letra (LB por defecto) o con registro
const ext = por(calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 6, esquinasInteriores: 3, esquinasExteriores: 2 }));
assert.equal(ext['letra-LB'], 2);
assert.equal(ext.conector, 6); // 2 letras * 2 entradas + inicio y final
assert.equal(ext.codo, undefined);
const extReg = por(calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 6, esquinasExteriores: 2, exterior: 'registro', modeloPaso: '5x5' }));
assert.equal(calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 6, esquinasExteriores: 2, exterior: 'registro', modeloPaso: '5x5' }).find((x) => x.grupo === 'Registros').cantidad, 4); // 2 de esquina + inicio y final (mismo modelo, una línea)
assert.equal(extReg['letra-LB'], undefined);
assert.equal(extReg.conector, 6); // 2 de esquina * 2 + inicio y final
const ll = por(calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 6, esquinasExteriores: 1, letraEsquina: 'LL', letras: { T: 1 } }));
assert.equal(ll['letra-LL'], 1);
assert.equal(ll.conector, 7); // LL 2 + T 3 + inicio y final

// PVC sí lleva codos, interiores y exteriores
const pvc = por(calcularMateriales({ tipo: 'PVC', diametro: '2', metros: 2, esquinasInteriores: 1, esquinasExteriores: 2 }));
assert.equal(pvc.codo, 3);
assert.equal(pvc['letra-LB'], undefined);
assert.deepEqual(calcularMateriales({ tipo: 'PVC', diametro: '1', metros: 0 }), []);

// NEMA: modelo con tipo y medida editable; paso y final del mismo modelo se juntan
const d = calcularMateriales({ tipo: 'EMT', diametro: '1', metros: 10, modeloPaso: 'NEMA 3 12x12', modeloExtremos: 'NEMA 3 12x12', registros: [{ modelo: 'NEMA 3 12x12', funcion: 'paso', cantidad: 1 }] });
const nema = d.filter((x) => x.grupo === 'Registros');
assert.equal(nema.length, 1);
assert.equal(nema[0].cantidad, 3); // 1 de paso + inicio y final
assert.equal(nema[0].descripcion, 'Registro NEMA 3 12x12');

// emparejar con el inventario
const f = (t, d2, clave, nombre) =>
  coincide(
    nombre,
    calcularMateriales({
      tipo: t,
      diametro: d2,
      metros: 40,
      esquinasInteriores: 1,
      esquinasExteriores: 1,
      registros: [{ modelo: 'NEMA 1 12x12', funcion: 'final', cantidad: 1 }],
      letras: { LB: 1 },
    }).find((x) => x.clave === clave)
  );
assert.ok(f('EMT', '1/2', 'tubo', 'Tubo EMT 1/2" x 3 m'));
assert.ok(!f('EMT', '1/2', 'tubo', 'Tubo EMT 1 1/2" x 3 m')); // 1 1/2 no es 1/2
assert.ok(f('EMT', '1-1/2', 'tubo', 'Tubo EMT 1 1/2 pulg'));
assert.ok(!f('EMT', '1', 'tubo', 'Tubo EMT 3/4"'));
assert.ok(!f('EMT', '3/4', 'tubo', 'Tubo PVC 3/4"')); // tipo distinto
assert.ok(f('EMT', '3/4', 'coupling', 'Coupling EMT 3/4"'));
assert.ok(f('PVC', '3/4', 'coupling', 'Unión PVC 3/4"'));
assert.ok(f('EMT', '3/4', 'conector', 'Conector EMT 3/4"'));
assert.ok(f('EMT', '3/4', 'registro-4x4-final', 'Registro 4 x 4'));
assert.ok(!f('EMT', '3/4', 'registro-4x4-final', 'Registro 14x4'));
assert.ok(!f('EMT', '3/4', 'registro-4x4-final', 'Registro NEMA 1 4x4')); // NEMA no es un registro común
assert.ok(f('EMT', '3/4', 'registro-NEMA 1 12x12-final', 'Registro NEMA 1 12 x 12'));
assert.ok(!f('EMT', '3/4', 'registro-NEMA 1 12x12-final', 'Registro NEMA 3 12x12'));
assert.ok(f('EMT', '3/4', 'letra-LB', 'Letra LB EMT 3/4"'));
assert.ok(f('EMT', '3/4', 'letra-LB', 'Conduleta LB EMT 3/4"')); // el nombre viejo también vale
assert.ok(!f('EMT', '3/4', 'letra-LB', 'Letra LBB EMT 3/4"'));
assert.ok(!f('EMT', '3/4', 'letra-LB', 'Letra LL EMT 3/4"'));

assert.deepEqual(leerMedidasNema('6x6, 8 x 8; 10X10, basura, 12.5x12.5'), ['6x6', '8x8', '10x10', '12.5x12.5']);
console.log('materiales.check.mjs: ok');

// Ejecutar desde la raíz: node --experimental-strip-types src/ventasCsv.check.mjs
import assert from 'node:assert';
import { ventasCsv } from './ventasCsv.ts';

const base = { creado_en: '2026-10-05 10:00:00', numero: 'F-000001', ncf: 'B0100000001', cliente: 'Pérez, Juan', id_fiscal: '001', subtotal_cts: 10000, descuento_cts: 0, impuesto_cts: 1800, total_cts: 11800, anulada: 0 };
const csv = ventasCsv([base, { ...base, numero: 'F-000002', ncf: '00000000', anulada: 1 }]);
const l = csv.split('\r\n');
assert.equal(l[1], '2026-10-05,F-000001,B0100000001,"Pérez, Juan",001,100.00,0.00,18.00,118.00,Válida');
assert.equal(l[2], '2026-10-05,F-000002,,"Pérez, Juan",001,0.00,0.00,0.00,0.00,Anulada');
console.log('ventasCsv.check.mjs: ok');

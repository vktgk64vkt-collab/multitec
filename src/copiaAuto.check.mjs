// Ejecutar desde la raíz: node --experimental-strip-types src/copiaAuto.check.mjs
import assert from 'node:assert';
// la función pura se copia aquí para no cargar expo en Node
const src = (await import('node:fs')).readFileSync('src/copiaAuto.ts', 'utf8');
assert.ok(src.includes('.sort().reverse().slice(conservar)'));
const sobrantes = (n, c = 2) => [...n].sort().reverse().slice(c);
assert.deepEqual(sobrantes(['auto-2026-10-01', 'auto-2026-10-03', 'auto-2026-10-02']), ['auto-2026-10-01']);
console.log('copiaAuto.check.mjs: ok');

// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/vozTextos.check.mjs
import assert from 'node:assert/strict';

import { ESPERA_ARRANQUE_MS, ESPERA_INICIAL_MS, mensajeVoz, reintentable, SILENCIO_MS } from './vozTextos.ts';

// cada error de iOS tiene su explicación; cortar a propósito no dice nada
assert.equal(mensajeVoz('aborted'), null);
for (const codigo of ['no-speech', 'not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'interrupted', 'busy']) {
  assert.ok(mensajeVoz(codigo)?.length > 20, codigo);
}
assert.match(mensajeVoz('network'), /internet/);
assert.match(mensajeVoz('interrupted'), /llamada|Siri/);
assert.equal(mensajeVoz('algo-raro', 'detalle'), 'No se pudo usar la voz: detalle');
assert.equal(mensajeVoz('algo-raro'), 'No se pudo usar la voz.');

// solo "ocupado" se reintenta solo
assert.equal(reintentable('busy'), true);
assert.equal(reintentable('network'), false);

// tiempos razonables: callar un par de segundos corta, pero no tan rápido que parta una frase
assert.ok(SILENCIO_MS >= 2000 && SILENCIO_MS <= 4000);
assert.ok(ESPERA_INICIAL_MS > SILENCIO_MS);
assert.ok(ESPERA_ARRANQUE_MS >= 2000);

console.log('voz ok');

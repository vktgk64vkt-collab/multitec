// Ejecutar: node --experimental-strip-types src/contacto.check.mjs
import assert from 'node:assert/strict';

import { urlWhatsApp } from './contacto.ts';

assert.equal(urlWhatsApp('809-555-1234'), 'https://wa.me/18095551234'); // 10 dígitos: antepone el 1
assert.equal(urlWhatsApp('(829) 555 1234'), 'https://wa.me/18295551234');
assert.equal(urlWhatsApp('+1 849 555 1234'), 'https://wa.me/18495551234'); // ya trae el código
assert.equal(urlWhatsApp('8095551234', 'Hola, ¿qué tal?'), 'https://wa.me/18095551234?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F');
assert.equal(urlWhatsApp(''), null);
assert.equal(urlWhatsApp(null), null);
console.log('contacto ok');

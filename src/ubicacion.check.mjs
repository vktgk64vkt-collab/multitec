// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/ubicacion.check.mjs
import assert from 'node:assert/strict';

import { coordenadasDeEnlace, enlaceDeBusqueda, enlaceDeCoordenadas, leerCoordenadas, normalizarUbicacion, textoCoordenadas } from './ubicacion.ts';

// del GPS al enlace de Google Maps, y de vuelta
const punto = { lat: 18.4861, lng: -69.9312 };
const enlace = enlaceDeCoordenadas(punto);
assert.equal(enlace, 'https://www.google.com/maps/search/?api=1&query=18.486100,-69.931200');
assert.deepEqual(coordenadasDeEnlace(enlace), punto);
assert.equal(textoCoordenadas(punto), '18.486100, -69.931200');

// búsqueda por dirección escrita
assert.equal(enlaceDeBusqueda(' Av. Abraham Lincoln #1, Santo Domingo '), 'https://www.google.com/maps/search/?api=1&query=Av.%20Abraham%20Lincoln%20%231%2C%20Santo%20Domingo');

// coordenadas sueltas
assert.deepEqual(leerCoordenadas('18.4861, -69.9312'), punto);
assert.deepEqual(leerCoordenadas('18.4861 -69.9312'), punto);
assert.equal(leerCoordenadas('91, 20'), null); // latitud fuera de rango
assert.equal(leerCoordenadas('Calle 5'), null);

// lo que se acepta al guardar
assert.equal(normalizarUbicacion(''), null);
assert.equal(normalizarUbicacion('18.4861, -69.9312'), enlace);
assert.equal(normalizarUbicacion('https://maps.app.goo.gl/AbCd1234'), 'https://maps.app.goo.gl/AbCd1234');
assert.equal(normalizarUbicacion('https://www.google.com/maps/place/Casa/@18.4861,-69.9312,17z'), 'https://www.google.com/maps/place/Casa/@18.4861,-69.9312,17z');
assert.equal(normalizarUbicacion('https://goo.gl/maps/xyz'), 'https://goo.gl/maps/xyz');
assert.equal(normalizarUbicacion('http://maps.app.goo.gl/AbCd1234'), null, 'solo https');
assert.equal(normalizarUbicacion('https://example.com/maps'), null, 'solo enlaces de Google Maps');
assert.equal(normalizarUbicacion('javascript:alert(1)'), null);
assert.equal(normalizarUbicacion('https://maps.app.goo.gl/x y'), null, 'sin espacios');
assert.equal(normalizarUbicacion('https://www.google.com.do/maps?q=18.4,-69.9') !== null, true); // dominio de país

// coordenadas dentro de enlaces conocidos
assert.deepEqual(coordenadasDeEnlace('https://www.google.com/maps/place/Casa/@18.4861,-69.9312,17z'), punto);
assert.deepEqual(coordenadasDeEnlace('https://www.google.com/maps/place/X/data=!3d18.4861!4d-69.9312'), punto);
assert.equal(coordenadasDeEnlace('https://maps.app.goo.gl/AbCd1234'), null);

console.log('ubicacion ok');

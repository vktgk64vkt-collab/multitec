// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/articuloVoz.check.mjs
import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./db/alias.mjs', import.meta.url);
const { aDatosProducto, armarPeticionArticulo, leerArticulo, pareceArticuloNuevo } = await import('./articuloVoz.ts');

// ---- cuándo una frase pide un artículo NUEVO (y cuándo es un pedido para el levantamiento)
for (const si of [
  'agrégame una cámara IP de 4 mpx bullet al inventario',
  'agrega al inventario un NVR de 8 canales',
  'añade una cámara turret en el catálogo',
  'crea un nuevo artículo: sensor de movimiento',
  'registra en mi inventario un router mikrotik',
]) assert.equal(pareceArticuloNuevo(si), true, si);
for (const no of [
  '3 cámaras turret y un gabinete 4u pequeño',
  'agrega 3 cámaras del inventario en la entrada',
  'en la sala pon dos sensores',
  'agrégame cuatro cámaras al levantamiento',
]) assert.equal(pareceArticuloNuevo(no), false, no);

// ---- la petición lleva las familias y el esquema estricto
const pet = armarPeticionArticulo(' agrégame una cámara ip de 4mpx bullet al inventario ', 'claude-sonnet-5-5');
assert.equal(pet.model, 'claude-sonnet-5-5');
assert.ok(pet.system.includes('CCTV') && pet.system.includes('Hikvision') && pet.system.includes('Epcom') && pet.system.includes('4MPX'));
assert.deepEqual(pet.output_config.format.schema.properties.familia.enum.slice(0, 2), ['CCTV', 'Alarma']);
assert.equal(pet.output_config.format.schema.additionalProperties, false);
assert.ok(pet.messages[0].content.includes('agrégame una cámara ip de 4mpx bullet al inventario'));
assert.ok(!('temperature' in pet) && !('top_p' in pet), 'sin parámetros de muestreo');

// ---- lo que devuelve Claude, validado
const respuesta = {
  familia: 'CCTV', tipo: 'Cámara', tecnologia: 'IP', forma: 'Bullet', especificacion: '4MPX', marca: 'N/A', modelo: 'N/A',
  costo: null, existencia: null, apodos: ['Cámara bullet 4', 'bullet 4mpx', 'x'], descripcion: null, notas: null,
};
const b = leerArticulo(respuesta);
assert.equal(b.familia, 'CCTV');
assert.deepEqual(b.apodos, ['cámara bullet 4', 'bullet 4mpx'], 'sin apodos de una letra, en minúsculas');
const d = aDatosProducto(b);
assert.equal(d.nombre, 'Cámara IP Bullet 4MPX', 'el mismo nombre que armaría el formulario');
assert.deepEqual([d.tipo, d.categoria, d.stock, d.precio_cts, d.costo_cts, d.margen1_pct], ['equipo', 'CCTV', null, 0, 0, null]);
assert.deepEqual([d.f_tipo, d.f_tecnologia, d.f_forma, d.f_especificacion, d.f_marca, d.f_modelo], ['Cámara', 'IP', 'Bullet', '4MPX', null, null]);
assert.equal(d.apodos, 'cámara bullet 4, bullet 4mpx');

// con marca, modelo, costo y existencia
const completo = aDatosProducto(leerArticulo({ ...respuesta, marca: 'Hikvision', modelo: 'DS-2CD2043G2-I', costo: 3500.5, existencia: 6 }));
assert.equal(completo.nombre, 'Cámara IP Bullet 4MPX Hikvision DS-2CD2043G2-I');
assert.equal(completo.costo_cts, 350050);
assert.equal(completo.precio_cts, Math.round(350050 * 1.15 * 1.18), 'precio 1 = costo + 15 % + ITBIS, como en el formulario');
assert.deepEqual([completo.margen1_pct, completo.margen2_pct, completo.margen3_pct, completo.stock], [15, 17.5, 20, 6]);

// un servicio no lleva stock
const servicio = aDatosProducto(leerArticulo({ ...respuesta, familia: 'Servicios', tipo: 'Instalación', tecnologia: 'N/A', forma: 'N/A', especificacion: 'N/A', existencia: 4 }));
assert.deepEqual([servicio.tipo, servicio.stock], ['servicio', null]);

// respuestas que no sirven
assert.throws(() => leerArticulo({ ...respuesta, familia: 'Cocina' }), /tipo de equipo/);
assert.throws(() => leerArticulo({ ...respuesta, tipo: 'N/A' }), /qué artículo/);
assert.throws(() => leerArticulo(null), /tipo de equipo/);
// un costo absurdo o negativo se ignora en vez de guardarse
assert.equal(leerArticulo({ ...respuesta, costo: -5 }).costo_cts, 0);
assert.equal(leerArticulo({ ...respuesta, costo: 'mucho' }).costo_cts, 0);
assert.equal(leerArticulo({ ...respuesta, existencia: 2.5 }).stock, null);

console.log('articulo por voz ok');

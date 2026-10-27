// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/pedido.check.mjs
import assert from 'node:assert/strict';

import { armarPeticion, entenderLocal, leerRespuesta, normalizar, separarApodos } from './pedido.ts';

const inv = [
  { id: 1, nombre: 'Cámara IP Turret 4MPX Hikvision DS-2CD2143G2-I', apodos: ['turret 4', 'camara turret'], tipo: 'equipo' },
  { id: 2, nombre: 'Cámara IP Bullet 4MPX Hikvision DS-2CD2043G2-I', apodos: ['bullet'], tipo: 'equipo' },
  { id: 3, nombre: 'Gabinete 4U Pared Eaton', apodos: ['gabinete 4u pequeño', 'rack chico'], tipo: 'equipo' },
  { id: 4, nombre: 'Gabinete 12U Piso Eaton', apodos: ['gabinete 12u', 'rack grande'], tipo: 'equipo' },
  { id: 5, nombre: 'Instalación CCTV Por punto Estándar', apodos: ['instalacion camara', 'punto de camara'], tipo: 'servicio' },
  { id: 6, nombre: 'Switch PoE Rack 8P Ubiquiti USW-8-POE', apodos: ['switch 8'], tipo: 'equipo' },
];
const resumen = (t) => entenderLocal(t, inv).lineas.map((l) => [l.id, l.cantidad]);

// --- texto
assert.equal(normalizar('  Cámaras IP, 4MPX!  '), 'camaras ip 4mpx');
assert.deepEqual(separarApodos('gabinete 4u chico, rack pequeño;  rack 4u'), ['gabinete 4u chico', 'rack pequeño', 'rack 4u']);
assert.deepEqual(separarApodos(null), []);

// --- el caso del usuario: un gabinete de 4u pequeño -> el artículo que tiene ese apodo
assert.deepEqual(resumen('un gabinete de 4u pequeño'), [[3, 1]]);
assert.equal(entenderLocal('un gabinete de 4u pequeño', inv).lineas[0].confianza, 'alta');
assert.deepEqual(resumen('gabinete grande'), [[4, 1]]);

// --- varias líneas dictadas de corrido, con cantidades en número o en palabra
assert.deepEqual(resumen('3 cámaras turret, un gabinete 4u pequeño y dos switch 8'), [[1, 3], [3, 1], [6, 2]]);
assert.deepEqual(resumen('necesito 4 bullets'), [[2, 4]]);
assert.deepEqual(resumen('ocho puntos de camara'), [[5, 8]]);
assert.deepEqual(resumen('agrega 2 racks chicos'), [[3, 2]]);

// --- lo que no está en el inventario no se inventa
const nada = entenderLocal('una impresora láser', inv).lineas[0];
assert.equal(nada.id, null);
assert.equal(nada.confianza, 'baja');
assert.deepEqual(entenderLocal('', inv).lineas, []);

// --- ambiguo: hay más de una opción razonable y se avisa
const amb = entenderLocal('2 cámaras ip', inv).lineas[0];
assert.ok(amb.alternativas.length >= 1, 'ofrece alternativas');
assert.notEqual(amb.confianza, 'alta');

// --- petición a Claude: ids, nombres y apodos; nada de precios; esquema estructurado; mismo orden siempre
const body = armarPeticion('3 cámaras turret', [...inv].reverse(), 'claude-sonnet-5-5', 'Entrada');
assert.equal(body.model, 'claude-sonnet-5-5');
assert.equal(body.output_config.format.type, 'json_schema');
assert.ok(body.system.includes('3 | Gabinete 4U Pared Eaton | gabinete 4u pequeño; rack chico | equipo'));
assert.ok(body.system.indexOf('1 | Cámara IP Turret') < body.system.indexOf('6 | Switch'), 'inventario ordenado por id');
assert.ok(!/precio|costo|RD\$/i.test(body.system.split('INVENTARIO:')[1]), 'no se envían precios ni costos');
assert.ok(body.messages[0].content.includes('Entrada') && body.messages[0].content.includes('3 cámaras turret'));
assert.ok(!('temperature' in body) && !('top_p' in body) && !('top_k' in body), 'la API actual rechaza el muestreo');
assert.equal(armarPeticion('x', inv, 'm', null).messages[0].content.includes('Área'), false);

// --- respuesta de Claude: se valida contra el inventario real
const ids = new Set(inv.map((a) => a.id));
const r = leerRespuesta(
  {
    lineas: [
      { texto: '3 turret', item_id: 1, cantidad: 3, area: ' Entrada ', confianza: 'alta', alternativas: [2, 2, 99, 1] },
      { texto: 'algo raro', item_id: 77, cantidad: 0, area: '', confianza: 'alta', alternativas: [3] }, // id inventado, cantidad inválida
      { texto: 'switch', item_id: 6, cantidad: 2.4, area: null, confianza: 'rara', alternativas: [] },
    ],
    notas: '  No entendí la última  ',
  },
  ids
);
assert.deepEqual(r.lineas[0], { texto: '3 turret', id: 1, cantidad: 3, area: 'Entrada', alternativas: [2], confianza: 'alta' });
assert.equal(r.lineas[1].id, null); // un id que no existe nunca llega a la app
assert.equal(r.lineas[1].confianza, 'baja');
assert.equal(r.lineas[1].cantidad, 1);
assert.deepEqual(r.lineas[1].alternativas, [3]);
assert.equal(r.lineas[2].cantidad, 2);
assert.equal(r.lineas[2].confianza, 'media'); // valor desconocido
assert.equal(r.notas, 'No entendí la última');
assert.throws(() => leerRespuesta({ otra: 1 }, ids));
assert.throws(() => leerRespuesta(null, ids));

console.log('pedido ok');

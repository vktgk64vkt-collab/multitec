// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/ia.check.mjs
import assert from 'node:assert/strict';

const I = await import('./ia.ts');

const inv = [
  { id: 1, nombre: 'Cámara IP Bullet 4MPX', apodos: ['bullet 4'], tipo: 'equipo' },
  { id: 2, nombre: 'NVR 8CH', apodos: [], tipo: 'equipo' },
];

// ---- revisor: lleva el margen calculado, nunca el costo, y el esquema es estricto
const rev = I.armarPeticionRevision(
  [
    { descripcion: 'Cámara IP Bullet 4MPX', cantidad: 8, precio_cts: 500000, costo_cts: 400000, tipo: 'equipo', trabajo: 'Cámaras' },
    { descripcion: 'Instalación', cantidad: 1, precio_cts: 0, costo_cts: 0, tipo: 'servicio', trabajo: null },
  ],
  'claude-sonnet-5-5'
);
const filas = rev.messages[0].content;
assert.ok(filas.includes('8 × Cámara IP Bullet 4MPX') && filas.includes('margen 20%') && filas.includes('trabajo: Cámaras'));
assert.ok(!filas.includes('4000.00'), 'el costo no se envía, solo el margen');
assert.equal(rev.output_config.format.schema.additionalProperties, false);
assert.ok(!('temperature' in rev));

const ok = I.leerRevision({
  resumen: ' Falta el disco ',
  observaciones: [
    { gravedad: 'alta', texto: 'El NVR no tiene disco duro' },
    { gravedad: 'rara', texto: 'Sin switch PoE' },
    { gravedad: 'media', texto: '   ' },
  ],
});
assert.equal(ok.resumen, 'Falta el disco');
assert.deepEqual(ok.observaciones.map((o) => o.gravedad), ['alta', 'baja'], 'gravedad desconocida pasa a baja; las vacías se descartan');
assert.deepEqual(I.leerRevision({ resumen: 'Todo bien', observaciones: [] }).observaciones, []);
assert.throws(() => I.leerRevision({ resumen: 'x' }), /formato/);

// ---- factura de proveedor: imagen primero, inventario sin precios, ids validados
const img = { base64: 'AAAA', mime: 'image/jpeg' };
const pc = I.armarPeticionCompra(img, [...inv].reverse(), 'm');
assert.deepEqual(pc.messages[0].content[0], I.bloqueImagen(img));
assert.ok(pc.system.indexOf('1 | Cámara IP') < pc.system.indexOf('2 | NVR'), 'inventario ordenado por id');
assert.ok(!/precio|costo \|/i.test(pc.system.split('INVENTARIO:')[1]), 'sin precios en el inventario');

const compra = I.leerCompra(
  {
    proveedor: ' Epcom RD ',
    lineas: [
      { texto: 'CAM IP 4MP BULLET', item_id: 1, cantidad: 6, costo_unitario: 3500.505 },
      { texto: 'CABLE UTP', item_id: 99, cantidad: 0, costo_unitario: -3 }, // id inventado, cantidad y costo inválidos
      { texto: '', item_id: null, cantidad: 1, costo_unitario: null }, // línea vacía
    ],
    notas: null,
  },
  new Set([1, 2])
);
assert.equal(compra.proveedor, 'Epcom RD');
assert.equal(compra.lineas.length, 2);
assert.deepEqual(compra.lineas[0], { texto: 'CAM IP 4MP BULLET', id: 1, cantidad: 6, costo_cts: 350051 });
assert.deepEqual(compra.lineas[1], { texto: 'CABLE UTP', id: null, cantidad: 1, costo_cts: 0 });
assert.throws(() => I.leerCompra({}, new Set()), /formato/);

// ---- preguntas
const pq = I.armarPeticionPregunta('  ¿cuánto me deben? ', 'TOTALES: por cobrar RD$ 10', 'm');
assert.ok(pq.system.endsWith('TOTALES: por cobrar RD$ 10') && pq.messages[0].content === '¿cuánto me deben?');
assert.equal(I.leerRespuestaTexto({ respuesta: ' Te deben RD$ 10 ' }), 'Te deben RD$ 10');
assert.throws(() => I.leerRespuestaTexto({ respuesta: '' }));

// ---- redacción
const r = I.armarPeticionRedaccion('seguimiento', { cliente: 'Juan Pérez', total: 'RD$ 50,000', vacio: '', nulo: null }, 'Tekhnia', 'm');
assert.ok(r.messages[0].content.includes('cliente: Juan Pérez') && !r.messages[0].content.includes('vacio'));
assert.ok(r.system.includes('WhatsApp') && r.system.includes('Firma con «Tekhnia»'));
assert.ok(!I.armarPeticionRedaccion('alcance', { x: 'y' }, 'Tekhnia', 'm').system.includes('Firma con'), 'el resumen del trabajo no lleva firma');
assert.equal(I.leerMensaje({ mensaje: ' Hola ' }), 'Hola');
assert.throws(() => I.leerMensaje({ mensaje: '' }));

console.log('ia ok');

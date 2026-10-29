// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/pedidoPdf.check.mjs
import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./db/alias.mjs', import.meta.url);
const { armarPeticionPedidoPdf, buscarExistente, datosArticuloNuevo, leerPedidoPdf, planificarPedido } = await import('./pedidoPdf.ts');
const { debeSubirCosto } = await import('./db/catalogo.ts');

// ---- la petición lleva el PDF como documento y el esquema estricto
const pet = armarPeticionPedidoPdf({ tipo: 'pdf', base64: 'QUJD' }, 'claude-sonnet-5-5');
assert.equal(pet.messages[0].content[0].type, 'document');
assert.equal(pet.messages[0].content[0].source.media_type, 'application/pdf');
assert.equal(pet.output_config.format.schema.additionalProperties, false);
// una foto va como imagen, con el mismo esquema
const petFoto = armarPeticionPedidoPdf({ tipo: 'imagen', base64: 'QUJD', mime: 'image/jpeg' }, 'claude-sonnet-5-5');
assert.equal(petFoto.messages[0].content[0].type, 'image');
assert.equal(petFoto.messages[0].content[0].source.media_type, 'image/jpeg');
assert.deepEqual(petFoto.output_config, pet.output_config);
assert.ok(pet.system.includes('Hikvision'), 'incluye las marcas de las familias');

// ---- lo que devuelve Claude se valida línea por línea
const linea = (x) => ({ familia: 'CCTV', tipo: 'Cámara', tecnologia: 'IP', forma: 'Turret', especificacion: '4MPX', marca: 'Hikvision', modelo: 'DS-2CD2143G2-I', texto: 'CAM IP 4MP TURRET', descripcion: 'Visión nocturna 30 m, IP67', cantidad: 4, costo_unitario: 3500.5, ...x });
const pedido = leerPedidoPdf({
  proveedor: ' Distribuidora X ', moneda: 'RD$', notas: null,
  lineas: [
    linea({}),
    linea({ tipo: 'N/A', texto: 'ENVIO' }), // sin tipo: no es un artículo
    linea({ familia: 'Inventada', texto: 'RARO' }), // familia que no existe
    linea({ tipo: 'NVR', tecnologia: 'N/A', forma: 'N/A', especificacion: '8CH', modelo: 'DS-7608NI', texto: 'NVR 8CH', descripcion: null, cantidad: 0, costo_unitario: null }),
  ],
});
assert.equal(pedido.proveedor, 'Distribuidora X');
assert.equal(pedido.moneda, 'DOP');
assert.equal(pedido.lineas.length, 2);
assert.deepEqual(pedido.ilegibles, ['ENVIO', 'RARO']);
assert.equal(pedido.lineas[0].costo, 3500.5);
assert.equal(pedido.lineas[0].borrador.descripcion, 'Visión nocturna 30 m, IP67');
assert.equal(pedido.lineas[1].cantidad, 1, 'cantidad mínima 1');
assert.equal(pedido.lineas[1].costo, 0, 'sin costo leído');
assert.throws(() => leerPedidoPdf({ lineas: 'no' }), /formato/);
assert.equal(leerPedidoPdf({ moneda: 'usd', lineas: [] }).moneda, 'USD');

// ---- qué es nuevo y qué ya existe
const art = (o) => ({ id: 1, nombre: 'X', precio_cts: 0, tipo: 'equipo', categoria: 'CCTV', costo_cts: 0, stock: null, margen1_pct: null, margen2_pct: null, margen3_pct: null, f_tipo: 'Cámara', f_tecnologia: null, f_forma: null, f_especificacion: null, f_marca: null, f_modelo: null, codigo: 'CCTV-0001', descripcion: null, atributos: null, apodos: null, por_camara: 0, ...o });
const turret = art({ id: 7, nombre: 'Cámara IP Turret 4MPX Hikvision DS-2CD2143G2-I', f_marca: 'Hikvision', f_modelo: 'DS-2CD2143G2-I', costo_cts: 300000, margen1_pct: 15, precio_cts: 407100 });
const inventario = [turret];

assert.equal(buscarExistente(pedido.lineas[0].borrador, inventario)?.id, 7, 'mismo nombre estándar');
const otroNombre = leerPedidoPdf({ moneda: 'DOP', lineas: [linea({ forma: 'Bullet', marca: 'N/A' })] }).lineas[0].borrador; // mismo modelo escrito distinto
assert.equal(buscarExistente(otroNombre, inventario)?.id, 7, 'mismo modelo del fabricante');
assert.equal(buscarExistente(leerPedidoPdf({ moneda: 'DOP', lineas: [linea({ modelo: 'DS-2CD9999', marca: 'Dahua' })] }).lineas[0].borrador, inventario), null);

// costo mayor: se actualiza; menor o igual: se queda; sin costo: no se toca
assert.equal(debeSubirCosto(300000, 350050), true);
assert.equal(debeSubirCosto(300000, 300000), false);
assert.equal(debeSubirCosto(300000, 250000), false);
assert.equal(debeSubirCosto(300000, 0), false);
assert.equal(debeSubirCosto(0, 250000), true, 'sin costo registrado, el del pedido entra');

const plan = planificarPedido(pedido.lineas, inventario);
assert.equal(plan.length, 2);
const [camara, nvr] = plan;
assert.equal(camara.existente.id, 7);
assert.equal(camara.sube, true); // 3500.50 > 3000.00
assert.equal(camara.costo_cts, 350050);
assert.equal(camara.precio_cts, Math.round(350050 * 1.15 * 1.18), 'el precio sale del margen del artículo');
assert.equal(nvr.existente, null);
assert.equal(nvr.sube, false);

// más barato: el costo registrado se queda
const barato = planificarPedido(leerPedidoPdf({ moneda: 'DOP', lineas: [linea({ costo_unitario: 2800 })] }).lineas, inventario)[0];
assert.equal(barato.sube, false);
assert.equal(barato.precio_cts, null);

// el artículo nuevo: nombre estándar, descripción breve, costo y márgenes base
const datos = datosArticuloNuevo(nvr, true);
assert.equal(datos.nombre, 'NVR 8CH Hikvision DS-7608NI');
assert.equal(datos.categoria, 'CCTV');
assert.equal(datos.stock, 1);
assert.equal(datos.costo_cts, 0);
const conCosto = datosArticuloNuevo({ ...camara, existente: null }, false);
assert.equal(conCosto.stock, null);
assert.equal(conCosto.descripcion, 'Visión nocturna 30 m, IP67');
assert.equal(conCosto.margen1_pct, 15);
assert.equal(conCosto.precio_cts, Math.round(350050 * 1.15 * 1.18));
// con los márgenes del negocio
const conMis = datosArticuloNuevo({ ...camara, existente: null }, false, [10, 25, 40]);
assert.deepEqual([conMis.margen1_pct, conMis.margen2_pct, conMis.margen3_pct], [10, 25, 40]);
assert.equal(conMis.precio_cts, Math.round(350050 * 1.1 * 1.18));

// líneas repetidas del pedido no repiten el artículo: se suman y se queda el costo mayor
const repetidas = planificarPedido(leerPedidoPdf({ moneda: 'DOP', lineas: [linea({ cantidad: 2, costo_unitario: 100 }), linea({ cantidad: 3, costo_unitario: 120 })] }).lineas, []);
assert.equal(repetidas.length, 1);
assert.equal(repetidas[0].cantidad, 5);
assert.equal(repetidas[0].costo_cts, 12000);

// moneda extranjera: la tasa pasa los costos a pesos
const usd = planificarPedido(leerPedidoPdf({ moneda: 'USD', lineas: [linea({ costo_unitario: 50 })] }).lineas, [], 60.5)[0];
assert.equal(usd.costo_cts, 302500);

console.log('pedidoPdf.check.mjs: ok');

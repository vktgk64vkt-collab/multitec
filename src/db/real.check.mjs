// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/real.check.mjs
// Corre las migraciones y las funciones REALES de db/*.ts contra SQLite, con un adaptador que imita a expo-sqlite
// (incluida la regla de que una transacción no puede abrirse dentro de otra). Si el código cambia, esta prueba lo nota.
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

register('./alias.mjs', import.meta.url);

function crearDb() {
  const d = new DatabaseSync(':memory:');
  const params = (p) => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p);
  return {
    execAsync: async (sql) => void d.exec(sql),
    runAsync: async (sql, ...p) => {
      const r = d.prepare(sql).run(...params(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql, ...p) => {
      const r = d.prepare(sql).get(...params(p));
      return r ? { ...r } : null;
    },
    getAllAsync: async (sql, ...p) => d.prepare(sql).all(...params(p)).map((r) => ({ ...r })),
    withTransactionAsync: async (fn) => {
      d.exec('BEGIN');
      try {
        await fn();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const { migrarBaseDeDatos, VERSION_ACTUAL } = await import('./migraciones.ts');
const P = await import('./proyectos.ts');
const C = await import('./cotizacion.ts');
const E = await import('./ejecucion.ts');
const F = await import('./factura.ts');
const K = await import('./kits.ts');
const R = await import('./resumen.ts');
const { crearCliente, actualizarCliente, obtenerCliente } = await import('./clientes.ts');
const L = await import('./levantamiento.ts');
const Cat = await import('./catalogo.ts');

const db = crearDb();
await migrarBaseDeDatos(db);
assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, VERSION_ACTUAL);
await migrarBaseDeDatos(db); // volver a abrir la app no rompe nada

const cliente = await crearCliente(db, { nombre: 'Juan Pérez', empresa: null, telefono: null, correo: null, direccion: null, id_fiscal: null, notas: null, ubicacion_url: null });
const idCliente = typeof cliente === 'number' ? cliente : cliente.lastInsertRowId ?? cliente;
const sesion = async (nombre) => {
  const id = await P.crearProyecto(db, idCliente, nombre, 'CCTV');
  await C.crearLinea(db, id, { descripcion: 'Cámara IP', cantidad: 4, precio_cts: 1000000 });
  await C.crearLinea(db, id, { descripcion: 'Instalación', cantidad: 1, precio_cts: 500000, tipo: 'servicio' });
  return id;
};

// --- una cotización nueva todavía no es proyecto
const a = await sesion('Casa Juan');
assert.equal((await P.listarProyectos(db, 'activos')).length, 0);
assert.deepEqual((await P.listarProyectos(db, 'activos', 'cotizacion')).map((p) => p.nombre), ['Casa Juan']);
const vacio = await P.crearProyecto(db, idCliente, 'Sin líneas', 'CCTV');
assert.equal(await P.aprobarCotizacion(db, vacio), false, 'sin líneas no se aprueba');

// --- el resumen de la lista sale igual que el de una fila
await C.guardarDescuentoGlobal(db, a, 10);
let lista = await R.proyectosConResumen(db, 'activos', 'cotizacion');
const fila = lista.find((x) => x.proyecto.id === a).resumen;
assert.deepEqual(fila, await R.resumenProyecto(db, a));
// 4 × 10,000 + 5,000 = 45,000; ITBIS incluido: subtotal 38,135.59; con 10 % de descuento el total es 40,500
assert.equal(fila.total_cts, 4050000);
assert.equal(fila.lineas, 2);

// --- enviada al compartir; una enviada no vuelve a cambiar sola
await P.marcarEnviada(db, a);
assert.equal((await P.obtenerProyecto(db, a)).cot_estado, 'enviada');
assert.ok((await P.obtenerProyecto(db, a)).enviada_en);

// --- aprobar: todo o nada (si la copia a la ejecución falla, no queda aprobada a medias)
await db.execAsync('ALTER TABLE ejecucion_items RENAME TO ejecucion_items_x');
await assert.rejects(() => P.aprobarCotizacion(db, a));
assert.equal((await P.obtenerProyecto(db, a)).aprobado_en, null, 'la aprobación se deshizo');
await db.execAsync('ALTER TABLE ejecucion_items_x RENAME TO ejecucion_items');

assert.equal(await P.aprobarCotizacion(db, a), true);
assert.equal(await P.aprobarCotizacion(db, a), false, 'ya era proyecto');
const proyecto = await P.obtenerProyecto(db, a);
assert.deepEqual([!!proyecto.aprobado_en, proyecto.estado, proyecto.cot_estado], [true, 'en ejecución', 'aprobada']);
assert.deepEqual((await P.listarProyectos(db, 'activos')).map((p) => p.nombre), ['Casa Juan']);
assert.equal((await P.listarProyectos(db, 'activos', 'cotizacion')).some((p) => p.id === a), false);

// --- ejecución: se quita una cámara y se agrega material; el resumen y la factura usan lo real
const lineas = await E.listarEjecucion(db, a);
await E.cambiarCantidad(db, lineas[0].id, 3);
await E.agregarAEjecucion(db, a, { descripcion: 'Canaleta', cantidad: 2, precio_cts: 50000 });
const resumen = await R.resumenProyecto(db, a);
assert.equal(resumen.ejecucion.cambios, 2);
assert.equal(resumen.ejecucion.real_cts, Math.round((3 * 1000000 + 500000 + 2 * 50000) * 0.9)); // 36,000 con el 10 %
const { deEjecucion, lineas: aFacturar } = await E.lineasParaFacturar(db, a);
assert.equal(deEjecucion, true);
assert.equal(aFacturar.length, 3);

// --- factura: el descuento se congela y el desglose suma
assert.equal(await F.siguienteNcf(db), null, 'sin facturas no hay nada que sugerir');
assert.equal(await F.crearFactura(db, a, 'B0100000045'), 'ok');
const f = await F.obtenerFactura(db, a);
assert.equal(f.total_cts, resumen.ejecucion.real_cts);
assert.equal(f.subtotal_cts - f.descuento_cts + f.impuesto_cts, f.total_cts);
assert.equal(f.descuento_pct, 10);
assert.equal(await F.siguienteNcf(db), 'B0100000046');
assert.equal((await P.obtenerProyecto(db, a)).estado, 'facturado');
assert.equal(await F.crearFactura(db, (await sesion('Otra').then(async (id) => (await P.aprobarCotizacion(db, id), id))), 'B0100000045'), 'ncf_repetido');

// --- sin comprobante: el NCF 00000000 se repite sin problema
const b = await sesion('Oficina');
const c = await sesion('Taller');
for (const id of [b, c]) await P.aprobarCotizacion(db, id);
assert.equal(await F.crearFactura(db, b, F.SIN_NCF), 'ok');
assert.equal(await F.crearFactura(db, c, F.SIN_NCF), 'ok');
assert.equal(await F.siguienteNcf(db), 'B0100000046', 'el 00000000 no cuenta para la serie');

// --- kits: se guardan de una cotización y se agregan a otra; lo repetido suma
const d = await sesion('Nueva');
assert.equal(await K.guardarKit(db, d, '  '), false);
assert.equal(await K.guardarKit(db, d, 'Casa con 4 cámaras'), true);
const e = await P.crearProyecto(db, idCliente, 'Casa 2', 'CCTV');
assert.equal(await K.aplicarKit(db, (await K.listarKits(db))[0].id, e), 2);
assert.equal((await C.listarLineas(db, e)).length, 2);
await K.aplicarKit(db, (await K.listarKits(db))[0].id, e);
assert.deepEqual((await C.listarLineas(db, e)).map((l) => l.cantidad), [8, 2], 'el mismo kit dos veces suma cantidades');

// --- un proyecto nuevo hereda ajustes del último, menos el impuesto
await db.runAsync("UPDATE proyectos SET nivel_precio = 3, precios_con_itbis = 0, impuesto_pct = 0, condiciones = 'Mis condiciones' WHERE id = ?", e);
const hereda = await P.obtenerProyecto(db, await P.crearProyecto(db, idCliente, 'Hereda', 'CCTV'));
assert.deepEqual([hereda.nivel_precio, hereda.precios_con_itbis, hereda.impuesto_pct], [3, 0, 18]);

// --- reabrir un cerrado vuelve al estado que corresponde
await P.cambiarEstado(db, a, 'cerrado');
await P.reabrirProyecto(db, a);
assert.equal((await P.obtenerProyecto(db, a)).estado, 'facturado');

// --- fotos que hay que borrar al eliminar el proyecto
await db.runAsync("INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, foto_uri) VALUES (?, 'x', 'y', 1, 'fotos/1.jpg')", d);
await db.runAsync("INSERT INTO comprobantes (proyecto_id, foto_uri) VALUES (?, 'fotos/2.jpg')", d);
assert.deepEqual((await P.fotosDelProyecto(db, d)).sort(), ['fotos/1.jpg', 'fotos/2.jpg']);

// --- varios trabajos en un proyecto: alarma, cámaras y portón en la misma casa
await db.execAsync(`INSERT INTO catalogo (nombre, precio_cts, tipo, categoria) VALUES
  ('Cámara IP', 1000000, 'equipo', 'CCTV'), ('Panel de alarma', 2500000, 'equipo', 'Alarma'), ('Motor de portón', 4000000, 'equipo', 'Control de acceso'), ('Instalación', 500000, 'servicio', 'Servicios')`);
const inv = Object.fromEntries((await Cat.listarCatalogo(db)).map((p) => [p.nombre, p]));
const casa = await P.crearProyecto(db, idCliente, 'Casa de playa', 'CCTV');
const parte = (area, cantidad) => ({ area, equipo: '', cantidad, notas: null, foto_uri: null });
const poner = (nombre, area, cantidad, trabajo) => L.crearPartida(db, casa, { ...parte(area, cantidad), equipo: nombre, ...(trabajo === undefined ? {} : { trabajo }) }, inv[nombre], inv[nombre].precio_cts);
await poner('Cámara IP', 'Sala', 2); // el trabajo sale de la categoría
await poner('Cámara IP', 'Patio', 1); // otra área, mismo trabajo: una sola línea de 3
await poner('Panel de alarma', 'Sala', 1);
await poner('Motor de portón', 'Frente', 1, 'Portón'); // a mano
await poner('Instalación', 'Sala', 1); // los servicios no traen trabajo: General
let ls = await C.listarLineas(db, casa);
assert.deepEqual(ls.map((l) => [l.descripcion, l.cantidad, l.trabajo]), [
  ['Cámara IP', 3, 'CCTV'],
  ['Panel de alarma', 1, 'Alarma'],
  ['Motor de portón', 1, 'Portón'],
  ['Instalación', 1, null],
]);
assert.deepEqual((await C.listarTrabajos(db, casa)).sort(), ['Alarma', 'CCTV', 'Portón']);

// el mismo equipo en otro trabajo es otra línea, y al mover una línea donde ya está el mismo equipo, se suman
await poner('Cámara IP', 'Portón', 1, 'Portón');
ls = await C.listarLineas(db, casa);
assert.equal(ls.filter((l) => l.descripcion === 'Cámara IP').length, 2);
await C.moverLinea(db, ls.find((l) => l.descripcion === 'Cámara IP' && l.trabajo === 'Portón').id, 'CCTV');
ls = await C.listarLineas(db, casa);
assert.deepEqual(ls.filter((l) => l.descripcion === 'Cámara IP').map((l) => [l.cantidad, l.trabajo]), [[4, 'CCTV']]);
await C.moverLinea(db, ls.find((l) => l.descripcion === 'Instalación').id, 'Alarma');
assert.equal((await C.listarLineas(db, casa)).find((l) => l.descripcion === 'Instalación').trabajo, 'Alarma');

// borrar una partida resta de la línea de SU trabajo
const partidaPatio = (await L.listarPartidas(db, casa)).find((p) => p.area === 'Patio');
await L.eliminarPartida(db, partidaPatio.id);
assert.equal((await C.listarLineas(db, casa)).find((l) => l.descripcion === 'Cámara IP').cantidad, 3);

// el trabajo viaja a la ejecución y a la factura
assert.equal(await P.aprobarCotizacion(db, casa), true);
assert.deepEqual([...new Set((await E.listarEjecucion(db, casa)).map((l) => l.trabajo))].sort(), ['Alarma', 'CCTV', 'Portón']);
await E.agregarAEjecucion(db, casa, { descripcion: 'Canaleta', cantidad: 5, precio_cts: 10000, trabajo: 'Portón' });
assert.equal(await F.crearFactura(db, casa, F.SIN_NCF), 'ok');
const facturaCasa = await F.obtenerFactura(db, casa);
const itemsFactura = await F.listarLineasFactura(db, facturaCasa.id);
assert.deepEqual(itemsFactura.map((l) => l.trabajo).sort(), ['Alarma', 'Alarma', 'CCTV', 'Portón', 'Portón']);

// duplicar el proyecto conserva los trabajos
const copia = await P.duplicarProyecto(db, casa);
assert.deepEqual((await C.listarTrabajos(db, copia)).sort(), ['Alarma', 'CCTV', 'Portón']);

// --- ubicación del cliente: se guarda, y el proyecto la trae para "Cómo llegar"
const enlaceMapa = 'https://www.google.com/maps/search/?api=1&query=18.486100,-69.931200';
const datosCliente = { ...(await obtenerCliente(db, idCliente)) };
await actualizarCliente(db, idCliente, { ...datosCliente, direccion: 'Av. Lincoln 1', ubicacion_url: enlaceMapa });
assert.equal((await obtenerCliente(db, idCliente)).ubicacion_url, enlaceMapa);
const conMapa = await P.obtenerProyecto(db, d);
assert.deepEqual([conMapa.ubicacion_url, conMapa.cliente_direccion], [enlaceMapa, 'Av. Lincoln 1']);

// --- "Aprobada" y deshacerla: solo mientras no haya nada que perder
const g = await sesion('Deshacer');
assert.equal(await P.deshacerAprobacion(db, g), false, 'una cotización sin aprobar no tiene qué deshacer');
assert.equal(await P.aprobarCotizacion(db, g), true);
assert.equal(await P.deshacerAprobacion(db, g), true);
const vuelta = await P.obtenerProyecto(db, g);
assert.deepEqual([vuelta.aprobado_en, vuelta.cot_estado, vuelta.estado, vuelta.ejecucion_iniciada_en], [null, 'enviada', 'cotizado', null]);
assert.equal((await E.listarEjecucion(db, g)).length, 0, 'la ejecución sin cambios se quita');
assert.equal((await C.listarLineas(db, g)).length, 2, 'la cotización queda intacta');
// con un cambio en la ejecución ya no se puede
await P.aprobarCotizacion(db, g);
await E.cambiarCantidad(db, (await E.listarEjecucion(db, g))[0].id, 1);
assert.equal(await P.deshacerAprobacion(db, g), false);
assert.equal((await P.obtenerProyecto(db, g)).estado, 'en ejecución');
// con un comprobante tampoco
const h = await sesion('Con comprobante');
await P.aprobarCotizacion(db, h);
await E.agregarComprobante(db, h, 'fotos/9.jpg', null, null);
assert.equal(await P.deshacerAprobacion(db, h), false);

console.log('real ok');

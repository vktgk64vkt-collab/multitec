// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/camaras.check.mjs
// Cobros automáticos: mano de obra por cámara y por punto de red (la cantidad la fija la cotización) y % de los equipos de
// alarma (el precio lo fija la cotización). Siguen todos los cambios de la cotización. Usa las funciones REALES de db/*.ts (mismo adaptador que real.check.mjs).
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

const { migrarBaseDeDatos } = await import('./migraciones.ts');
const Cat = await import('./catalogo.ts');
const C = await import('./cotizacion.ts');
const L = await import('./levantamiento.ts');
const P = await import('./proyectos.ts');
const { crearCliente } = await import('./clientes.ts');

const db = crearDb();
await migrarBaseDeDatos(db);
const cliente = await crearCliente(db, { nombre: 'Juan', empresa: null, telefono: null, correo: null, direccion: null, id_fiscal: null, notas: null, ubicacion_url: null });
const idCliente = typeof cliente === 'number' ? cliente : cliente.lastInsertRowId ?? cliente;
const proyecto = await P.crearProyecto(db, idCliente, 'Casa', 'CCTV');

const base = { stock: null, descripcion: null, apodos: null, atributos: null, f_tecnologia: null, f_forma: null, f_especificacion: null, f_marca: null, f_modelo: null, margen1_pct: null, margen2_pct: null, margen3_pct: null, costo_cts: 0 };
const nuevo = async (d) => {
  await Cat.crearProducto(db, { ...base, ...d });
  return (await db.getFirstAsync('SELECT * FROM catalogo ORDER BY id DESC LIMIT 1'));
};
const turret = await nuevo({ nombre: 'Cámara IP Turret 4MPX', tipo: 'equipo', categoria: 'CCTV', f_tipo: 'Cámara', precio_cts: 300000 });
const bullet = await nuevo({ nombre: 'Cámara IP Bullet 2MPX', tipo: 'equipo', categoria: 'CCTV', f_tipo: 'Cámara', precio_cts: 250000 });
const nvr = await nuevo({ nombre: 'NVR 8CH', tipo: 'equipo', categoria: 'CCTV', f_tipo: 'NVR', precio_cts: 900000 });
const obra = await nuevo({ nombre: 'Mano de obra CCTV Por punto', tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Mano de obra', precio_cts: 150000, cobro_auto: 'camara' });
const otro = await nuevo({ nombre: 'Visita técnica', tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Visita técnica', precio_cts: 100000 });
assert.equal(obra.cobro_auto, 'camara');
assert.equal(turret.cobro_auto, null);

const cantidad = async (item) => (await C.listarLineas(db, proyecto)).filter((l) => l.item_id === item.id).reduce((s, l) => s + l.cantidad, 0);
const agregar = (p, cant, area = 'Entrada') => L.crearPartida(db, proyecto, { area, equipo: p.nombre, cantidad: cant, notas: null, foto_uri: null }, p, p.precio_cts);

// la mano de obra puesta antes que las cámaras no desaparece
await agregar(obra, 1);
assert.equal(await cantidad(obra), 1);

// cámaras de distintos tipos: la mano de obra sigue la suma
await agregar(turret, 3);
assert.equal(await cantidad(obra), 3);
await agregar(bullet, 2, 'Patio');
assert.equal(await cantidad(obra), 5);
await agregar(nvr, 1); // lo que no es cámara no cuenta
assert.equal(await cantidad(obra), 5);
await agregar(otro, 2); // ni otros servicios
assert.equal(await cantidad(obra), 5);
assert.equal(await cantidad(otro), 2);

// agregar la mano de obra otra vez no la multiplica
await agregar(obra, 1, 'Patio');
assert.equal(await cantidad(obra), 5);
assert.equal((await C.listarLineas(db, proyecto)).filter((l) => l.item_id === obra.id).length, 1);
assert.equal((await C.listarLineas(db, proyecto)).find((l) => l.item_id === obra.id).cobro_auto, 'camara');

// precio: el del inventario, por cada cámara
const linea = (await C.listarLineas(db, proyecto)).find((l) => l.item_id === obra.id);
assert.equal(linea.precio_cts * linea.cantidad, 750000);

// quitar cámaras baja la mano de obra (desde la cotización o desde el levantamiento)
const lineaBullet = (await C.listarLineas(db, proyecto)).find((l) => l.item_id === bullet.id);
await C.eliminarLinea(db, lineaBullet.id);
assert.equal(await cantidad(obra), 3);
const partidaTurret = (await L.listarPartidas(db, proyecto)).find((p) => p.item_id === turret.id);
await L.eliminarPartida(db, partidaTurret.id);
assert.equal(await cantidad(turret), 0);
assert.equal(await cantidad(obra), 0, 'sin cámaras, la mano de obra automática sobra');
assert.equal(await cantidad(nvr), 1);

// quitar la mano de obra desde el levantamiento la quita de verdad (aunque haya cámaras)
await agregar(turret, 2);
assert.equal(await cantidad(obra), 0, 'la mano de obra ya se había quitado: no reaparece sola');
await agregar(obra, 1);
assert.equal(await cantidad(obra), 2);
for (const p of (await L.listarPartidas(db, proyecto)).filter((x) => x.item_id === obra.id)) await L.eliminarPartida(db, p.id);
assert.equal(await cantidad(obra), 0);
assert.equal(await cantidad(turret), 2);

// una mano de obra en otro trabajo no se duplica: queda una sola línea
await C.crearLinea(db, proyecto, { descripcion: obra.nombre, cantidad: 1, precio_cts: 150000, tipo: 'servicio', item_id: obra.id, trabajo: 'CCTV' });
await C.crearLinea(db, proyecto, { descripcion: obra.nombre, cantidad: 1, precio_cts: 150000, tipo: 'servicio', item_id: obra.id, trabajo: 'Redes' });
const lineasObra = (await C.listarLineas(db, proyecto)).filter((l) => l.item_id === obra.id);
assert.equal(lineasObra.length, 1);
assert.equal(lineasObra[0].cantidad, 2);

// editar el artículo sin tocar la marca la conserva; apagarla la quita
await Cat.actualizarProducto(db, obra.id, { ...base, nombre: obra.nombre, tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Mano de obra', precio_cts: 150000 });
assert.equal((await Cat.obtenerProducto(db, obra.id)).cobro_auto, 'camara');
await Cat.actualizarProducto(db, obra.id, { ...base, nombre: obra.nombre, tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Mano de obra', precio_cts: 150000, cobro_auto: null });
assert.equal((await Cat.obtenerProducto(db, obra.id)).cobro_auto, null);

// ---- puntos de red: la cantidad es la de los artículos que cuentan como punto (Jack, Face plate por defecto)
const proyecto2 = await P.crearProyecto(db, idCliente, 'Oficina', 'Redes');
const en2 = (p, cant) => L.crearPartida(db, proyecto2, { area: 'Sala', equipo: p.nombre, cantidad: cant, notas: null, foto_uri: null }, p, p.precio_cts);
const cant2 = async (item) => (await C.listarLineas(db, proyecto2)).filter((l) => l.item_id === item.id).reduce((s, l) => s + l.cantidad, 0);
const jack = await nuevo({ nombre: 'Jack Cat6', tipo: 'equipo', categoria: 'Cableado', f_tipo: 'Jack', precio_cts: 5000 });
const placa = await nuevo({ nombre: 'Face plate 2 puertos', tipo: 'equipo', categoria: 'Cableado', f_tipo: 'Face plate', precio_cts: 4000 });
const switchRed = await nuevo({ nombre: 'Switch 8P', tipo: 'equipo', categoria: 'Redes', f_tipo: 'Switch', precio_cts: 80000 });
const puntoObra = await nuevo({ nombre: 'Mano de obra Redes Por punto', tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Mano de obra', precio_cts: 120000, cobro_auto: 'punto' });
await en2(puntoObra, 1);
await en2(jack, 6);
await en2(placa, 3);
await en2(switchRed, 1);
assert.equal(await cant2(puntoObra), 9, 'jacks + placas; el switch no es punto');
await en2(turret, 2); // las cámaras no cuentan como punto de red
assert.equal(await cant2(puntoObra), 9);
// los tipos que cuentan se eligen
await Cat.actualizarProducto(db, puntoObra.id, { ...base, nombre: puntoObra.nombre, tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Mano de obra', precio_cts: 120000, cobro_auto: 'punto', cobro_param: 'Jack' });
await en2(jack, 1);
assert.equal(await cant2(puntoObra), 7, 'ahora solo cuentan los jacks');

// ---- alarma: un % del precio de venta de los equipos de alarma, cantidad 1
const proyecto3 = await P.crearProyecto(db, idCliente, 'Tienda', 'Alarma');
const en3 = (p, cant) => L.crearPartida(db, proyecto3, { area: 'Local', equipo: p.nombre, cantidad: cant, notas: null, foto_uri: null }, p, p.precio_cts);
const lineas3 = () => C.listarLineas(db, proyecto3);
const panel = await nuevo({ nombre: 'Alarma Panel 16 zonas', tipo: 'equipo', categoria: 'Alarma', f_tipo: 'Panel', precio_cts: 1000000 });
const sensor = await nuevo({ nombre: 'Alarma Sensor de movimiento PIR', tipo: 'equipo', categoria: 'Alarma', f_tipo: 'Sensor de movimiento', precio_cts: 100000 });
const instAlarma = await nuevo({ nombre: 'Instalación de alarma', tipo: 'servicio', categoria: 'Servicios', f_tipo: 'Instalación', precio_cts: 0, cobro_auto: 'alarma', cobro_param: '15' });
await en3(instAlarma, 1);
await en3(panel, 1);
await en3(sensor, 4);
let inst = (await lineas3()).find((l) => l.item_id === instAlarma.id);
assert.equal(inst.cantidad, 1);
assert.equal(inst.precio_cts, 210000, '15 % de (1,000,000 + 4 x 100,000)');
await en3(sensor, 1); // un sensor más cambia el precio
assert.equal((await lineas3()).find((l) => l.item_id === instAlarma.id).precio_cts, 225000);
await en3(nvr, 1); // lo que no es de alarma no cuenta
assert.equal((await lineas3()).find((l) => l.item_id === instAlarma.id).precio_cts, 225000);
// cambiar el precio de un equipo de alarma recalcula; el de un equipo de otra familia no
const lPanel = (await lineas3()).find((l) => l.item_id === panel.id);
await C.actualizarPrecio(db, lPanel.id, 2000000);
assert.equal((await lineas3()).find((l) => l.item_id === instAlarma.id).precio_cts, 375000);
// quitar todos los equipos de alarma quita el cobro
for (const p of (await L.listarPartidas(db, proyecto3)).filter((x) => x.item_id === panel.id || x.item_id === sensor.id)) await L.eliminarPartida(db, p.id);
assert.equal((await lineas3()).filter((l) => l.item_id === instAlarma.id).length, 0);

// ---- márgenes del negocio: nacen en 15, 20 y 30, se pueden cambiar y se aplican al inventario
const N = await import('./negocio.ts');
assert.deepEqual(await N.obtenerMargenes(db), [15, 20, 30]);
await N.guardarMargenes(db, [10, 25, 40]);
assert.deepEqual(await N.obtenerMargenes(db), [10, 25, 40]);
await N.guardarNegocio(db, { nombre: 'Mi Empresa', rnc: null, telefono: null, correo: null, direccion: null, logo_uri: null, lema: null, color: null });
assert.deepEqual(await N.obtenerMargenes(db), [10, 25, 40], 'guardar los datos de la empresa no borra los márgenes');
assert.equal((await N.obtenerNegocio(db)).nombre, 'Mi Empresa');
// artículos: uno con precio calculado (17.5 / 20 / 20) y uno de precio fijo
await Cat.crearProducto(db, { ...base, nombre: 'Disco 2TB', tipo: 'equipo', categoria: 'CCTV', f_tipo: 'Disco duro', costo_cts: 400000, precio_cts: 0, margen1_pct: 17.5, margen2_pct: 20, margen3_pct: 20 });
const disco = await db.getFirstAsync("SELECT * FROM catalogo WHERE nombre = 'Disco 2TB'");
const cambiados = await Cat.aplicarMargenesATodo(db, [15, 20, 30]);
const despues = await Cat.obtenerProducto(db, disco.id);
assert.deepEqual([despues.margen1_pct, despues.margen2_pct, despues.margen3_pct], [15, 20, 30]);
assert.equal(despues.precio_cts, Math.round(400000 * 1.15 * 1.18), 'el precio 1 se recalcula con el margen nuevo');
assert.equal((await Cat.obtenerProducto(db, turret.id)).precio_cts, 300000, 'los de precio fijo no cambian');
assert.equal((await Cat.obtenerProducto(db, turret.id)).margen1_pct, null);
assert.ok(cambiados >= 1);

console.log('cobros.check.mjs: ok');

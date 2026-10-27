// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/NOMBRE.check.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const src = readFileSync('src/db/migraciones.ts', 'utf8');
const BT = String.fromCharCode(96);
function bloque(v) {
  const i = src.indexOf(`version < ${v})`);
  const a = src.indexOf(BT, i) + 1;
  return src.slice(a, src.indexOf(BT, a));
}

const db = new DatabaseSync(':memory:');
// base v9 mínima
db.exec(`
CREATE TABLE proyectos(id INTEGER PRIMARY KEY, nombre TEXT, impuesto_pct REAL DEFAULT 18);
CREATE TABLE levantamiento(id INTEGER PRIMARY KEY, proyecto_id INT, area TEXT, equipo TEXT, cantidad INT, notas TEXT, foto_uri TEXT);
CREATE TABLE cotizacion_items(id INTEGER PRIMARY KEY, proyecto_id INT, descripcion TEXT, cantidad INT DEFAULT 1, precio_cts INT DEFAULT 0, descuento_pct REAL DEFAULT 0);
CREATE TABLE factura_items(id INTEGER PRIMARY KEY, factura_id INT, descripcion TEXT, cantidad INT, precio_cts INT, descuento_pct REAL DEFAULT 0);
CREATE TABLE catalogo(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, precio_cts INT NOT NULL DEFAULT 0);
INSERT INTO proyectos(id,nombre) VALUES (1,'P');
INSERT INTO catalogo(id,nombre,precio_cts) VALUES (1,'Cámara',150000);`);
db.exec(bloque(10));
db.exec(bloque(11));
db.exec(bloque(12));
db.exec(src.match(/version < 17\) \{[\s\S]*?execAsync\('([^']+)'\)/)[1]); // el SQL real de la migración 17

// inventario con stock y costo
db.exec(`UPDATE catalogo SET stock = 3, costo_cts = 90000 WHERE id = 1`);

// partida del inventario + línea enlazada (mismo SQL que crearPartida)
const r = db.prepare('INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, notas, foto_uri, item_id) VALUES (?,?,?,?,?,?,?)').run(1, 'Entrada', 'Cámara', 2, null, null, 1);
db.prepare(`INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, tipo, costo_cts, item_id, partida_id) VALUES (?,?,?,?,?,?,?,?)`)
  .run(1, 'Cámara (Entrada)', 2, 150000, 'equipo', 90000, 1, Number(r.lastInsertRowid));
// partida manual
db.prepare('INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad) VALUES (1, ?, ?, 1)').run('Bodega', 'Switch');

// importar solo pendientes (no duplica la enlazada)
const importar = `INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, partida_id)
  SELECT proyecto_id, equipo || ' (' || area || ')', cantidad, id FROM levantamiento l
  WHERE proyecto_id = 1 AND NOT EXISTS (SELECT 1 FROM cotizacion_items c WHERE c.partida_id = l.id) ORDER BY id`;
db.exec(importar);
assert.equal(db.prepare('SELECT COUNT(*) c FROM cotizacion_items').get().c, 2);
db.exec(importar); // idempotente
assert.equal(db.prepare('SELECT COUNT(*) c FROM cotizacion_items').get().c, 2);

// borrar partida quita su línea
db.prepare('DELETE FROM cotizacion_items WHERE partida_id = ?').run(Number(r.lastInsertRowid));
db.prepare('DELETE FROM levantamiento WHERE id = ?').run(Number(r.lastInsertRowid));
assert.equal(db.prepare('SELECT COUNT(*) c FROM cotizacion_items').get().c, 1);

// stock baja al facturar y no pasa de 0
const baja = (n) => db.prepare('UPDATE catalogo SET stock = MAX(0, stock - ?) WHERE id = 1 AND stock IS NOT NULL').run(n);
baja(2); assert.equal(db.prepare('SELECT stock s FROM catalogo').get().s, 1);
baja(5); assert.equal(db.prepare('SELECT stock s FROM catalogo').get().s, 0);
db.exec('UPDATE catalogo SET stock = NULL'); baja(1); assert.equal(db.prepare('SELECT stock s FROM catalogo').get().s, null);
console.log('flujo ok');
// v11: artículos anteriores quedan de precio fijo y proyectos anteriores sin ITBIS incluido
const art = db.prepare('SELECT margen1_pct m, precio_cts p FROM catalogo WHERE id = 1').get();
assert.equal(art.m, null); assert.equal(art.p, 150000);
const pr = db.prepare('SELECT precios_con_itbis i, nivel_precio n FROM proyectos WHERE id = 1').get();
assert.equal(pr.i, 0); assert.equal(pr.n, 1);
console.log('v11 ok');
assert.equal(db.prepare('SELECT f_tipo t, f_modelo m FROM catalogo WHERE id = 1').get().t, null); // artículo anterior: nombre libre
console.log('v12 ok');
// v17: apodos para dictar
db.exec("UPDATE catalogo SET apodos = 'gabinete 4u pequeño, rack chico' WHERE id = 1");
assert.equal(db.prepare('SELECT apodos a FROM catalogo WHERE id = 1').get().a, 'gabinete 4u pequeño, rack chico');
assert.equal(db.prepare("SELECT COUNT(*) n FROM catalogo WHERE apodos LIKE '%rack chico%'").get().n, 1); // la búsqueda por apodo
console.log('v17 ok');

// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/ejecucion.check.mjs
// Comprueba el SQL de db/ejecucion.ts: copia de la cotización, suma de duplicados, quitar/restaurar y descartar.
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE proyectos(id INTEGER PRIMARY KEY, estado TEXT DEFAULT 'cotizado', ejecucion_iniciada_en TEXT);
CREATE TABLE cotizacion_items(id INTEGER PRIMARY KEY, proyecto_id INT, descripcion TEXT, detalle TEXT, cantidad INT, precio_cts INT,
  descuento_pct REAL DEFAULT 0, tipo TEXT DEFAULT 'equipo', costo_cts INT DEFAULT 0, item_id INT);
CREATE TABLE ejecucion_items(id INTEGER PRIMARY KEY, proyecto_id INT REFERENCES proyectos(id) ON DELETE CASCADE, descripcion TEXT NOT NULL,
  detalle TEXT, cantidad INT NOT NULL, cantidad_cotizada INT NOT NULL DEFAULT 0, precio_cts INT NOT NULL DEFAULT 0,
  descuento_pct REAL NOT NULL DEFAULT 0, tipo TEXT NOT NULL DEFAULT 'equipo', costo_cts INT NOT NULL DEFAULT 0, item_id INT);
CREATE TABLE comprobantes(id INTEGER PRIMARY KEY, proyecto_id INT REFERENCES proyectos(id) ON DELETE CASCADE, foto_uri TEXT NOT NULL, nota TEXT, monto_cts INT);
INSERT INTO proyectos(id) VALUES (1), (2);
INSERT INTO cotizacion_items(proyecto_id, descripcion, cantidad, precio_cts, item_id) VALUES (1, 'Cámara', 4, 10000, 7), (1, 'Cable', 2, 500, NULL), (2, 'Otra', 1, 100, NULL);
`);
const q = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const uno = (sql, ...p) => db.prepare(sql).get(...p);

// --- iniciar: copia solo ese proyecto, guarda lo cotizado y cambia el estado
db.prepare(`INSERT INTO ejecucion_items (proyecto_id, descripcion, detalle, cantidad, cantidad_cotizada, precio_cts, descuento_pct, tipo, costo_cts, item_id)
  SELECT proyecto_id, descripcion, detalle, cantidad, cantidad, precio_cts, descuento_pct, tipo, costo_cts, item_id FROM cotizacion_items WHERE proyecto_id = ? ORDER BY id`).run(1);
db.prepare("UPDATE proyectos SET ejecucion_iniciada_en = datetime('now'), estado = 'en ejecución' WHERE id = ?").run(1);
assert.deepEqual(q('SELECT descripcion d, cantidad c, cantidad_cotizada k FROM ejecucion_items WHERE proyecto_id = 1 ORDER BY id'), [
  { d: 'Cámara', c: 4, k: 4 },
  { d: 'Cable', c: 2, k: 2 },
]);
assert.equal(uno('SELECT estado e FROM proyectos WHERE id = 1').e, 'en ejecución');

// --- agregar: el mismo artículo (o mismo nombre sin artículo) suma la cantidad
const existentePorItem = (p, item) => uno('SELECT id FROM ejecucion_items WHERE proyecto_id = ? AND item_id = ? ORDER BY id LIMIT 1', p, item);
const existentePorNombre = (p, n) => uno('SELECT id FROM ejecucion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1', p, n);
db.prepare('UPDATE ejecucion_items SET cantidad = cantidad + ? WHERE id = ?').run(1, existentePorItem(1, 7).id);
db.prepare('UPDATE ejecucion_items SET cantidad = cantidad + ? WHERE id = ?').run(3, existentePorNombre(1, '  CABLE ').id);
assert.deepEqual(q('SELECT cantidad c FROM ejecucion_items WHERE proyecto_id = 1 ORDER BY id').map((r) => r.c), [5, 5]);
assert.equal(existentePorNombre(1, 'Canaleta'), undefined);
db.prepare('INSERT INTO ejecucion_items (proyecto_id, descripcion, cantidad, cantidad_cotizada, precio_cts) VALUES (1, ?, 10, 0, 300)').run('Canaleta');

// --- quitar: lo agregado en ejecución se borra; lo cotizado queda en cero y se restaura
const quitar = (id) => {
  const l = uno('SELECT cantidad_cotizada k FROM ejecucion_items WHERE id = ?', id);
  if (l.k === 0) db.prepare('DELETE FROM ejecucion_items WHERE id = ?').run(id);
  else db.prepare('UPDATE ejecucion_items SET cantidad = 0 WHERE id = ?').run(id);
};
const id = (n) => uno('SELECT id FROM ejecucion_items WHERE descripcion = ? AND proyecto_id = 1', n).id;
quitar(id('Canaleta'));
assert.equal(uno("SELECT COUNT(*) n FROM ejecucion_items WHERE descripcion = 'Canaleta'").n, 0);
quitar(id('Cable'));
assert.equal(uno('SELECT cantidad c FROM ejecucion_items WHERE id = ?', id('Cable')).c, 0);
db.prepare('UPDATE ejecucion_items SET cantidad = cantidad_cotizada WHERE id = ?').run(id('Cable'));
assert.equal(uno('SELECT cantidad c FROM ejecucion_items WHERE id = ?', id('Cable')).c, 2);

// --- descartar: borra la ejecución y el estado vuelve; los comprobantes se quedan
db.prepare("INSERT INTO comprobantes (proyecto_id, foto_uri, monto_cts) VALUES (1, 'a.jpg', 1500)").run();
db.prepare('DELETE FROM ejecucion_items WHERE proyecto_id = ?').run(1);
db.prepare("UPDATE proyectos SET ejecucion_iniciada_en = NULL, estado = CASE WHEN estado = 'en ejecución' THEN 'cotizado' ELSE estado END WHERE id = ?").run(1);
assert.equal(uno('SELECT estado e, ejecucion_iniciada_en f FROM proyectos WHERE id = 1').e, 'cotizado');
assert.equal(uno('SELECT COUNT(*) n FROM comprobantes WHERE proyecto_id = 1').n, 1);
assert.equal(q('SELECT * FROM cotizacion_items WHERE proyecto_id = 1').length, 2); // la cotización no se tocó

// --- borrar el proyecto se lleva sus líneas y comprobantes
db.prepare('INSERT INTO ejecucion_items (proyecto_id, descripcion, cantidad) VALUES (1, ?, 1)').run('x');
db.prepare('DELETE FROM proyectos WHERE id = 1').run();
assert.equal(uno('SELECT COUNT(*) n FROM ejecucion_items').n, 0);
assert.equal(uno('SELECT COUNT(*) n FROM comprobantes').n, 0);

console.log('ejecucion db ok');

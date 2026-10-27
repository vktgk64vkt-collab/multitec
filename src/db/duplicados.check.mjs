// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/duplicados.check.mjs
// Repite el SQL de db/levantamiento.ts y db/cotizacion.ts sobre una base en memoria para comprobar cómo se suman los repetidos.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync('src/db/migraciones.ts', 'utf8');
const sqlBackfill = src.match(/EN_COTIZACION_SQL = '(.*)';/)[1];

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE levantamiento(id INTEGER PRIMARY KEY, proyecto_id INT, area TEXT, equipo TEXT, cantidad INT, item_id INT);
CREATE TABLE cotizacion_items(id INTEGER PRIMARY KEY, proyecto_id INT, descripcion TEXT, cantidad INT DEFAULT 1, precio_cts INT DEFAULT 0, item_id INT, partida_id INT);
`);
db.exec('ALTER TABLE levantamiento ADD COLUMN en_cotizacion INTEGER NOT NULL DEFAULT 0');
const q = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const lineas = () => q('SELECT descripcion, cantidad, precio_cts FROM cotizacion_items ORDER BY id');
const partidas = () => q('SELECT area, cantidad FROM levantamiento ORDER BY id');

// --- crearLinea: suma al artículo existente en vez de crear otra línea
function crearLinea(d) {
  const ex = d.item_id != null
    ? db.prepare('SELECT id FROM cotizacion_items WHERE proyecto_id = ? AND item_id = ? ORDER BY id LIMIT 1').get(1, d.item_id)
    : db.prepare('SELECT id FROM cotizacion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1').get(1, d.descripcion);
  if (ex) db.prepare('UPDATE cotizacion_items SET cantidad = cantidad + ?, precio_cts = CASE WHEN precio_cts = 0 THEN ? ELSE precio_cts END WHERE id = ?').run(d.cantidad, d.precio_cts, ex.id);
  else db.prepare('INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, precio_cts, item_id) VALUES (1, ?, ?, ?, ?)').run(d.descripcion, d.cantidad, d.precio_cts, d.item_id ?? null);
}
// --- crearPartida (del inventario)
function agregar(area, equipo, cantidad, itemId, precio) {
  const misma = db.prepare('SELECT id FROM levantamiento WHERE proyecto_id = 1 AND item_id = ? AND lower(trim(area)) = lower(trim(?)) ORDER BY id LIMIT 1').get(itemId, area);
  if (misma) db.prepare('UPDATE levantamiento SET cantidad = cantidad + ? WHERE id = ?').run(cantidad, misma.id);
  else db.prepare('INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, item_id, en_cotizacion) VALUES (1, ?, ?, ?, ?, 1)').run(area, equipo, cantidad, itemId);
  crearLinea({ descripcion: equipo, cantidad, precio_cts: precio, item_id: itemId });
}
// --- eliminarPartida
function quitar(id) {
  const p = db.prepare('SELECT proyecto_id, equipo, cantidad, item_id, en_cotizacion FROM levantamiento WHERE id = ?').get(id);
  const propia = db.prepare('DELETE FROM cotizacion_items WHERE partida_id = ?').run(id);
  if (propia.changes === 0 && p.en_cotizacion === 1) {
    const l = p.item_id !== null
      ? db.prepare('SELECT id, cantidad FROM cotizacion_items WHERE proyecto_id = ? AND item_id = ? ORDER BY id LIMIT 1').get(p.proyecto_id, p.item_id)
      : db.prepare('SELECT id, cantidad FROM cotizacion_items WHERE proyecto_id = ? AND item_id IS NULL AND lower(trim(descripcion)) = lower(trim(?)) ORDER BY id LIMIT 1').get(p.proyecto_id, p.equipo);
    if (l) {
      if (l.cantidad - p.cantidad > 0) db.prepare('UPDATE cotizacion_items SET cantidad = cantidad - ? WHERE id = ?').run(p.cantidad, l.id);
      else db.prepare('DELETE FROM cotizacion_items WHERE id = ?').run(l.id);
    }
  }
  db.prepare('DELETE FROM levantamiento WHERE id = ?').run(id);
}

// misma área: una sola partida y una sola línea
agregar('Entrada', 'Cámara IP', 2, 7, 1000);
agregar('entrada ', 'Cámara IP', 3, 7, 1000); // otra mayúscula/espacio: sigue siendo la misma área
assert.deepEqual(partidas(), [{ area: 'Entrada', cantidad: 5 }]);
assert.deepEqual(lineas(), [{ descripcion: 'Cámara IP', cantidad: 5, precio_cts: 1000 }]);

// otra área: otra partida, pero la cotización sigue con una sola línea
agregar('Bodega', 'Cámara IP', 4, 7, 1000);
assert.equal(partidas().length, 2);
assert.deepEqual(lineas(), [{ descripcion: 'Cámara IP', cantidad: 9, precio_cts: 1000 }]);

// otro artículo: línea aparte
agregar('Bodega', 'NVR 8CH', 1, 8, 5000);
assert.equal(lineas().length, 2);

// quitar una partida resta su cantidad; la última la borra
quitar(q('SELECT id FROM levantamiento WHERE area = ?', 'Bodega')[0].id);
assert.deepEqual(lineas()[0], { descripcion: 'Cámara IP', cantidad: 5, precio_cts: 1000 });
quitar(q("SELECT id FROM levantamiento WHERE area = 'Entrada'")[0].id);
assert.deepEqual(lineas().map((l) => l.descripcion), ['NVR 8CH']);

// partidas a mano (sin inventario): al importar se suman por nombre y no se repite el importe
db.exec("INSERT INTO levantamiento (proyecto_id, area, equipo, cantidad, item_id) VALUES (1, 'Patio', 'Switch 8P', 1, NULL), (1, 'Oficina', 'switch 8p', 2, NULL)");
assert.equal(db.prepare('SELECT COUNT(*) n FROM levantamiento WHERE proyecto_id = 1 AND en_cotizacion = 0').get().n, 2); // pendientes
for (const p of q('SELECT id, equipo, cantidad FROM levantamiento WHERE en_cotizacion = 0 ORDER BY id')) {
  crearLinea({ descripcion: p.equipo, cantidad: p.cantidad, precio_cts: 0 });
  db.prepare('UPDATE levantamiento SET en_cotizacion = 1 WHERE id = ?').run(p.id);
}
assert.deepEqual(lineas().filter((l) => /switch/i.test(l.descripcion)).map((l) => l.cantidad), [3]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM levantamiento WHERE en_cotizacion = 0').get().n, 0);
// un precio escrito después se respeta al sumar otra unidad
db.exec("UPDATE cotizacion_items SET precio_cts = 800 WHERE descripcion = 'Switch 8P'");
crearLinea({ descripcion: 'switch 8p', cantidad: 1, precio_cts: 0 });
assert.deepEqual(lineas().filter((l) => /switch/i.test(l.descripcion)).map((l) => [l.cantidad, l.precio_cts]), [[4, 800]]);
quitar(q("SELECT id FROM levantamiento WHERE area = 'Oficina'")[0].id);
assert.deepEqual(lineas().filter((l) => /switch/i.test(l.descripcion)).map((l) => l.cantidad), [2]);

// datos anteriores: una línea por partida enlazada por partida_id; la migración las marca y borrar sigue quitando solo su línea
db.exec('DELETE FROM levantamiento; DELETE FROM cotizacion_items;');
db.exec("INSERT INTO levantamiento (id, proyecto_id, area, equipo, cantidad, item_id) VALUES (1, 1, 'A', 'Cámara', 2, 7), (2, 1, 'B', 'Cámara', 3, 7), (3, 1, 'C', 'Cable', 1, NULL)");
db.exec("INSERT INTO cotizacion_items (proyecto_id, descripcion, cantidad, item_id, partida_id) VALUES (1, 'Cámara (A)', 2, 7, 1), (1, 'Cámara (B)', 3, 7, 2)");
db.exec(sqlBackfill);
assert.deepEqual(q('SELECT id, en_cotizacion FROM levantamiento ORDER BY id').map((r) => r.en_cotizacion), [1, 1, 0]); // la 3 sigue pendiente
quitar(1);
assert.deepEqual(lineas().map((l) => l.descripcion), ['Cámara (B)']);

console.log('duplicados ok');

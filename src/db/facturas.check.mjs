// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/facturas.check.mjs
// Comprueba el SQL de anulación, resumen y NCF único con las mismas consultas que db/factura.ts.
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE clientes(id INTEGER PRIMARY KEY);
CREATE TABLE proyectos(id INTEGER PRIMARY KEY, cliente_id INT REFERENCES clientes(id) ON DELETE CASCADE, estado TEXT DEFAULT 'facturado');
CREATE TABLE facturas(id INTEGER PRIMARY KEY, proyecto_id INT UNIQUE REFERENCES proyectos(id) ON DELETE CASCADE,
  ncf TEXT, total_cts INT, pagada INT DEFAULT 0, anulada INT DEFAULT 0, vence TEXT);
CREATE TABLE pagos(id INTEGER PRIMARY KEY, factura_id INT REFERENCES facturas(id) ON DELETE CASCADE, monto_cts INT);
CREATE TABLE factura_items(id INTEGER PRIMARY KEY, factura_id INT REFERENCES facturas(id) ON DELETE CASCADE, cantidad INT, item_id INT);
CREATE TABLE catalogo(id INTEGER PRIMARY KEY, stock INT);
INSERT INTO clientes(id) VALUES (1), (2);
INSERT INTO proyectos(id, cliente_id) VALUES (1,1), (2,1), (3,2), (4,2);
INSERT INTO facturas(id, proyecto_id, ncf, total_cts, vence) VALUES
  (1,1,'B0100000001',10000,'2000-01-01'),   -- vencida, con un pago
  (2,2,'B0100000002',5000,'2999-01-01'),
  (3,3,'B0100000003',7000,'2999-01-01'),    -- se anulará
  (4,4,'B0100000004',9000,'2999-01-01');
INSERT INTO pagos(factura_id, monto_cts) VALUES (1, 4000);
INSERT INTO catalogo(id, stock) VALUES (1, 5), (2, NULL);
INSERT INTO factura_items(factura_id, cantidad, item_id) VALUES (3, 3, 1), (3, 2, 2), (3, 1, NULL);
`);

// --- anular: devuelve el stock de lo facturado (solo con conteo), marca anulada y libera el proyecto
const anular = (id) => {
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pagos WHERE factura_id = ?').get(id).n, 0);
  db.prepare('UPDATE facturas SET anulada = 1 WHERE id = ?').run(id);
  db.prepare(`UPDATE catalogo SET stock = stock + (
      SELECT COALESCE(SUM(i.cantidad), 0) FROM factura_items i WHERE i.factura_id = ?1 AND i.item_id = catalogo.id)
    WHERE stock IS NOT NULL AND id IN (SELECT item_id FROM factura_items WHERE factura_id = ?1 AND item_id IS NOT NULL)`).run(id);
  db.prepare("UPDATE proyectos SET estado = 'cotizado' WHERE id = (SELECT proyecto_id FROM facturas WHERE id = ?)").run(id);
};
anular(3);
assert.equal(db.prepare('SELECT stock s FROM catalogo WHERE id = 1').get().s, 8); // 5 + 3
assert.equal(db.prepare('SELECT stock s FROM catalogo WHERE id = 2').get().s, null); // sin conteo: no se inventa stock
assert.equal(db.prepare('SELECT estado e FROM proyectos WHERE id = 3').get().e, 'cotizado');

// --- resumen: no cuenta anuladas ni facturas huérfanas (cliente borrado)
const VISIBLES = 'FROM facturas f JOIN proyectos p ON p.id = f.proyecto_id JOIN clientes c ON c.id = p.cliente_id WHERE f.anulada = 0';
const total = () =>
  db.prepare(`SELECT COALESCE(SUM(f.total_cts), 0) t, COALESCE(SUM((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id)), 0) c ${VISIBLES}`).get();
assert.deepEqual({ ...total() }, { t: 24000, c: 4000 }); // 10000 + 5000 + 9000; la anulada (7000) fuera
db.exec('PRAGMA foreign_keys = OFF');
db.exec('DELETE FROM clientes WHERE id = 2'); // cliente borrado sin cascada: sus facturas quedan huérfanas
assert.deepEqual({ ...total() }, { t: 15000, c: 4000 }); // la 4 ya no cuenta porque no se puede ver
const vencido = db.prepare(`SELECT COALESCE(SUM(f.total_cts - COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0)), 0) v
  ${VISIBLES} AND f.pagada = 0 AND f.vence < date('now', 'localtime')`).get().v;
assert.equal(vencido, 6000); // 10000 - 4000

// --- NCF único (también el de una factura anulada) y NCF repetido detectable antes de insertar
db.exec('CREATE UNIQUE INDEX idx_facturas_ncf ON facturas (ncf)');
assert.throws(() => db.exec("INSERT INTO facturas(proyecto_id, ncf, total_cts) VALUES (1, 'B0100000003', 1)"));
assert.ok(db.prepare("SELECT 1 FROM facturas WHERE ncf = 'B0100000003'").get()); // el de la anulada sigue consumido

// --- con claves foráneas activas, borrar un cliente arrastra todo: por eso la app lo bloquea si hay proyectos
db.exec('PRAGMA foreign_keys = ON');
const conProyectos = db.prepare('SELECT COUNT(*) n FROM proyectos WHERE cliente_id = ?').get(1).n;
assert.ok(conProyectos > 0); // eliminarCliente devuelve false aquí
db.exec('DELETE FROM clientes WHERE id = 1');
assert.equal(db.prepare('SELECT COUNT(*) n FROM facturas WHERE proyecto_id IN (1, 2)').get().n, 0); // cascada real

// --- pago mayor al saldo se rechaza
db.exec("INSERT INTO clientes(id) VALUES (9); INSERT INTO proyectos(id, cliente_id) VALUES (9, 9); INSERT INTO facturas(id, proyecto_id, ncf, total_cts) VALUES (9, 9, 'B0100000009', 500)");
const saldo = db.prepare('SELECT f.total_cts - COALESCE((SELECT SUM(monto_cts) FROM pagos WHERE factura_id = f.id), 0) s FROM facturas f WHERE f.id = 9').get().s;
assert.ok(1000 > saldo); // registrarPago devuelve false

console.log('facturas ok');

// --- sin comprobante: el NCF 00000000 puede repetirse, cualquier otro no (índice parcial de la migración 21)
const sinNcf = new DatabaseSync(':memory:');
sinNcf.exec("CREATE TABLE facturas(id INTEGER PRIMARY KEY, proyecto_id INT, ncf TEXT NOT NULL); CREATE UNIQUE INDEX idx_facturas_ncf ON facturas (ncf) WHERE ncf <> '00000000'");
for (const p of [1, 2, 3]) sinNcf.exec(`INSERT INTO facturas(proyecto_id, ncf) VALUES (${p}, '00000000')`);
sinNcf.exec("INSERT INTO facturas(proyecto_id, ncf) VALUES (4, 'B0100000001')");
assert.throws(() => sinNcf.exec("INSERT INTO facturas(proyecto_id, ncf) VALUES (5, 'B0100000001')"));
console.log('sin ncf ok');

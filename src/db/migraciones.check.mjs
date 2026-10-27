// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/NOMBRE.check.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const src = readFileSync('src/db/migraciones.ts', 'utf8');
const BT = String.fromCharCode(96);
// SQL del bloque `if (version < v)`: entre las dos comillas invertidas siguientes
function bloque(v) {
  const i = src.indexOf(`version < ${v})`);
  const a = src.indexOf(BT, i) + 1;
  return src.slice(a, src.indexOf(BT, a));
}

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE facturas(id INTEGER PRIMARY KEY, proyecto_id INT, ncf TEXT, subtotal_cts INT, impuesto_cts INT, total_cts INT, pagada INT DEFAULT 0, creado_en TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE cotizacion_items(id INTEGER PRIMARY KEY, descripcion TEXT);
CREATE TABLE factura_items(id INTEGER PRIMARY KEY, descripcion TEXT);
INSERT INTO facturas(id,total_cts,pagada,creado_en) VALUES (1,10000,1,'2026-10-01 10:00:00'),(2,5000,0,'2026-10-02 10:00:00');
INSERT INTO cotizacion_items(descripcion) VALUES ('x');`);
db.exec(bloque(8));
db.exec(bloque(9));
assert.equal(db.prepare('SELECT COUNT(*) c FROM pagos').get().c, 1); // solo la factura pagada
assert.equal(db.prepare('SELECT vence v FROM facturas WHERE id=1').get().v, '2026-10-31');
assert.equal(db.prepare('SELECT descuento_pct d FROM cotizacion_items').get().d, 0);
assert.equal(db.prepare('SELECT COUNT(*) c FROM negocio').get().c, 1);
console.log('migraciones ok');

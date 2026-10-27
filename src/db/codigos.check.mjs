// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/NOMBRE.check.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { CODIGOS_SQL, prefijoCodigo } from '../nomenclatura.ts';

const src = readFileSync('src/db/migraciones.ts', 'utf8');
const BT = String.fromCharCode(96);
const i = src.indexOf('version < 13)');
const a = src.indexOf(BT, i) + 1;
const alters = src.slice(a, src.indexOf(BT, a));

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE catalogo(id INTEGER PRIMARY KEY, nombre TEXT, categoria TEXT, stock INT);
INSERT INTO catalogo(nombre, categoria, stock) VALUES ('a','CCTV',1),('b','CCTV',2),('c','Servicios',NULL),('d','Otro',NULL),('e','CCTV',3),('f',NULL,NULL),('g','Control de acceso',1);`);
db.exec('CREATE TABLE cotizacion_items(id INTEGER PRIMARY KEY); CREATE TABLE factura_items(id INTEGER PRIMARY KEY); CREATE TABLE proyectos(id INTEGER PRIMARY KEY);');
db.exec(alters);
db.exec(CODIGOS_SQL);
db.exec('CREATE UNIQUE INDEX idx_catalogo_codigo ON catalogo (codigo)');
const codigos = db.prepare('SELECT codigo c FROM catalogo ORDER BY id').all().map((r) => r.c);
assert.deepEqual(codigos, ['CCTV-0001', 'CCTV-0002', 'SRV-0001', 'GEN-0001', 'CCTV-0003', 'GEN-0002', 'ACC-0001']);

// siguiente código (mismo SQL que siguienteCodigo)
const sig = (fam) => {
  const p = prefijoCodigo(fam);
  const n = db.prepare("SELECT COALESCE(MAX(CAST(substr(codigo, length(?1) + 2) AS INTEGER)), 0) AS n FROM catalogo WHERE codigo LIKE ?1 || '-%'").get(p).n;
  return `${p}-${String(n + 1).padStart(4, '0')}`;
};
assert.equal(sig('CCTV'), 'CCTV-0004');
assert.equal(sig('Redes'), 'RED-0001');
assert.equal(sig('Otro'), 'GEN-0003');
// no reutiliza códigos aunque se borre uno intermedio
db.exec("DELETE FROM catalogo WHERE codigo = 'CCTV-0002'");
assert.equal(sig('CCTV'), 'CCTV-0004');
// el índice impide duplicados
assert.throws(() => db.exec("INSERT INTO catalogo(nombre, categoria, codigo) VALUES ('x','CCTV','CCTV-0001')"));

// sumar stock: con conteo suma, sin conteo (NULL) empieza con la cantidad
const sumar = (id, n) => db.prepare('UPDATE catalogo SET stock = COALESCE(stock, 0) + ? WHERE id = ?').run(n, id);
sumar(1, 4); assert.equal(db.prepare('SELECT stock s FROM catalogo WHERE id = 1').get().s, 5);
sumar(3, 2); assert.equal(db.prepare('SELECT stock s FROM catalogo WHERE id = 3').get().s, 2);
console.log('codigos ok');

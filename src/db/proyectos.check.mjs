// Ejecutar desde la raíz del proyecto: node --experimental-strip-types src/db/proyectos.check.mjs
// Comprueba la migración 18 y el orden de los proyectos con el SQL de db/proyectos.ts.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const migraciones = readFileSync('src/db/migraciones.ts', 'utf8');
const codigo = readFileSync('src/db/proyectos.ts', 'utf8');

// SQL real de la migración 18 y del orden, sacados del código para que la prueba no se desactualice
const alter = migraciones.match(/version < 18\) \{[\s\S]*?execAsync\('([^']+)'\)/)[1];
const orden = codigo.match(/ORDER BY (\(p\.estado = 'cerrado'\), p\.prioridad DESC, p\.creado_en DESC, p\.id DESC)/)[1];
assert.ok(orden, 'el orden de listarProyectos');

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE clientes(id INTEGER PRIMARY KEY, nombre TEXT);
CREATE TABLE proyectos(id INTEGER PRIMARY KEY, cliente_id INT, nombre TEXT, estado TEXT, creado_en TEXT);
INSERT INTO clientes VALUES (1, 'Cliente');
-- datos anteriores a la migración: todos quedan con prioridad media
INSERT INTO proyectos VALUES (1, 1, 'viejo', 'cotizado', '2026-01-01 08:00:00');`);
db.exec(alter);
assert.equal(db.prepare('SELECT prioridad p FROM proyectos WHERE id = 1').get().p, 1, 'los proyectos anteriores quedan en media');

const ins = db.prepare('INSERT INTO proyectos (id, cliente_id, nombre, estado, creado_en, prioridad) VALUES (?, 1, ?, ?, ?, ?)');
ins.run(2, 'alta-vieja', 'levantamiento', '2026-02-01 08:00:00', 2);
ins.run(3, 'alta-nueva', 'en ejecución', '2026-03-01 08:00:00', 2);
ins.run(4, 'media-nueva', 'cotizado', '2026-03-05 08:00:00', 1);
ins.run(5, 'baja-nueva', 'levantamiento', '2026-03-09 08:00:00', 0);
ins.run(6, 'cerrado-alta', 'cerrado', '2026-03-10 08:00:00', 2);
ins.run(7, 'misma-fecha-a', 'cotizado', '2026-03-05 08:00:00', 1); // empate de prioridad y fecha: gana el id mayor

const lista = (donde) =>
  db.prepare(`SELECT p.nombre FROM proyectos p JOIN clientes c ON c.id = p.cliente_id ${donde} ORDER BY ${orden}`).all().map((r) => r.nombre);

// En curso: primero la prioridad, dentro de cada una el más reciente; los cerrados no salen
assert.deepEqual(lista("WHERE p.estado <> 'cerrado'"), ['alta-nueva', 'alta-vieja', 'misma-fecha-a', 'media-nueva', 'viejo', 'baja-nueva']);
// Cerrados: solo los cerrados
assert.deepEqual(lista("WHERE p.estado = 'cerrado'"), ['cerrado-alta']);
// Todos: los cerrados al final aunque tengan prioridad alta
assert.deepEqual(lista(''), ['alta-nueva', 'alta-vieja', 'misma-fecha-a', 'media-nueva', 'viejo', 'baja-nueva', 'cerrado-alta']);

console.log('proyectos ok');

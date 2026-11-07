import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openSQLite, runSQLite, batchSQLite, migrateSQLite } from '../runtime/sqlite.mjs';
import { signProofUser, readProofUser, proofReturnPath } from '../runtime/proof-session.mjs';

test('native SQLite batches preserve array columns and roll back a late failure', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'forrest-sqlite-'));
  const db = openSQLite(path.join(directory, 'test.sqlite'));
  try {
    db.exec('CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT)');
    const insert = value => ({ sql: 'INSERT INTO example VALUES (?, ?)', params: [1, value], method: 'run' });
    assert.throws(() => batchSQLite(db, [insert('first'), insert('conflict')]), /UNIQUE/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM example').get().n, 0);
    batchSQLite(db, [insert('saved')]);
    const result = runSQLite(db, { sql: 'SELECT id, value, id FROM example', params: [], method: 'all' });
    assert.deepEqual(result.rows, [[1, 'saved', 1]]);
    assert.equal(runSQLite(db, { sql: 'SELECT id FROM example WHERE id = 2', params: [], method: 'get' }).rows, undefined);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native migrations preserve an earlier schema, rerun safely and reject changed history', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'forrest-migrations-'));
  const filename = path.join(directory, 'test.sqlite');
  let db = openSQLite(filename);
  try {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    const first = journal.entries[0].tag;
    const sql = readFileSync('drizzle/' + first + '.sql', 'utf8');
    db.exec(sql);
    db.prepare("INSERT INTO training_plans (id, owner_id, race_name, race_date, pace_guide, version, created_at, updated_at) VALUES ('old', 'owner', 'Retained race', '2027-05-01', '[]', 3, '2026-01-01', '2026-01-01')").run();
    for (const [id, distance] of [['unknown', null], ['zero', 0], ['known', 5]]) {
      db.prepare("INSERT INTO workouts (id,plan_id,date,phase,type,planned_workout,target_pace,done,actual_distance,actual_pace,effort,pain,notes,source_row,original_source,version,updated_at) VALUES (?,'old','2026-10-23','Base Build','Easy Run','Original instruction','',1,?,'',NULL,'','Original note',2,NULL,4,'2026-10-23')")
        .run(id, distance);
    }
    const originalWorkouts = db.prepare('SELECT id,actual_distance,notes,version FROM workouts ORDER BY id').all();
    db.exec('CREATE TABLE forrest_node_migrations (tag TEXT PRIMARY KEY, hash TEXT NOT NULL)');
    db.prepare('INSERT INTO forrest_node_migrations VALUES (?, ?)').run(first, createHash('sha256').update(sql).digest('hex'));
    db.close();
    migrateSQLite(filename, process.cwd());
    migrateSQLite(filename, process.cwd());
    db = openSQLite(filename);
    assert.equal(db.prepare("SELECT race_name FROM training_plans WHERE id='old'").get().race_name, 'Retained race');
    assert.deepEqual(db.prepare('SELECT id,actual_distance,notes,version FROM workouts ORDER BY id').all(), originalWorkouts);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) AS n FROM forrest_node_migrations').get().n, journal.entries.length);
    db.prepare('UPDATE forrest_node_migrations SET hash = ? WHERE tag = ?').run('altered', first);
    assert.throws(() => migrateSQLite(filename, process.cwd()), /differs/);
  } finally {
    if (db.isOpen) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('local proof sessions reject tampering and unsafe return URLs', () => {
  const secret = 'synthetic-secret-for-the-local-proof-only';
  const user = { userId: 'proof-a', email: 'a@example.test', displayName: 'A', fullName: null };
  const token = signProofUser(user, secret);
  assert.deepEqual(readProofUser(token, secret), user);
  assert.equal(readProofUser(token + 'x', secret), null);
  assert.equal(readProofUser(token, 'different-synthetic-secret-for-proof-only'), null);
  assert.equal(readProofUser('', secret), null);
  for (const value of ['https://example.test/', '//example.test/', '/\\example.test/', '/node-proof-login']) assert.equal(proofReturnPath(value), '/');
  assert.equal(proofReturnPath('/blocks/one?tab=plan'), '/blocks/one?tab=plan');
});

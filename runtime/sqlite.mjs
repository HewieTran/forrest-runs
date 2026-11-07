import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function openSQLite(filename) {
  if (!path.isAbsolute(filename)) throw new Error('Choose an absolute SQLite file path.');
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  connection.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  return connection;
}

export function runSQLite(connection, query) {
  const statement = connection.prepare(query.sql);
  statement.setReturnArrays(true);
  if (query.method === 'run') {
    statement.run(...query.params);
    return { rows: [] };
  }
  if (query.method === 'get') return { rows: statement.get(...query.params) };
  return { rows: statement.all(...query.params) };
}

export function batchSQLite(connection, queries) {
  connection.exec('BEGIN IMMEDIATE');
  try {
    // Execute the whole batch synchronously so another request cannot interleave.
    const results = queries.map(query => runSQLite(connection, query));
    connection.exec('COMMIT');
    return results;
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}

export function migrateSQLite(filename, projectRoot) {
  const connection = openSQLite(filename);
  try {
    connection.exec('CREATE TABLE IF NOT EXISTS forrest_node_migrations (tag TEXT PRIMARY KEY, hash TEXT NOT NULL)');
    const journal = JSON.parse(readFileSync(path.join(projectRoot, 'drizzle/meta/_journal.json'), 'utf8'));
    const migrations = journal.entries.map(({ tag }) => {
      const sql = readFileSync(path.join(projectRoot, 'drizzle', tag + '.sql'), 'utf8');
      return { tag, sql, hash: createHash('sha256').update(sql).digest('hex') };
    });
    connection.exec('BEGIN IMMEDIATE');
    try {
      const applied = connection.prepare('SELECT tag, hash FROM forrest_node_migrations').all();
      for (const recorded of applied) {
        if (!migrations.some(migration => migration.tag === recorded.tag && migration.hash === recorded.hash)) {
          throw new Error('An applied SQLite migration differs from this checkout.');
        }
      }
      for (const migration of migrations) {
        if (applied.some(recorded => recorded.tag === migration.tag)) continue;
        connection.exec(migration.sql);
        connection.prepare('INSERT INTO forrest_node_migrations (tag, hash) VALUES (?, ?)').run(migration.tag, migration.hash);
      }
      connection.exec('COMMIT');
    } catch (error) {
      connection.exec('ROLLBACK');
      throw error;
    }
  } finally {
    connection.close();
  }
}

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
export const { Miniflare } = wranglerRequire('miniflare');

export async function migrationFiles() {
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
  return journal.entries.map((entry) => `drizzle/${entry.tag}.sql`);
}

export async function applyMigration(database, file) {
  const sql = await readFile(file, 'utf8');
  const statements = sql.split('--> statement-breakpoint')
    .map((statement) => statement.trim()).filter(Boolean);
  await database.batch(statements.map((statement) => database.prepare(statement)));
}

export async function applyAllMigrations(database) {
  for (const file of await migrationFiles()) await applyMigration(database, file);
}

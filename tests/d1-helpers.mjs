import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
export const { Miniflare, createFetchMock } = wranglerRequire('miniflare');

export async function insertExistingTestBlock(database, headers) {
  const ownerId = headers['oai-authenticated-user-id'];
  await database.prepare(`INSERT INTO training_plans
    (id, owner_id, status, race_name, race_date, pace_guide, created_at, updated_at)
    VALUES (?, ?, 'active', 'Existing training block', '2027-05-01', '[]',
      '2026-10-23T00:00:00.000Z', '2026-10-23T00:00:00.000Z')`)
    .bind(`plan:${ownerId}`, ownerId).run();
}

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

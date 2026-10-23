import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, migrationFiles, applyMigration } from './d1-helpers.mjs';

test('upgrade preserves existing records, permits multiple blocks, and enforces one active block', async () => {
  const worker = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("test"); } };',
    compatibilityDate: '2026-05-15',
    cf: false,
    d1Databases: { DB: 'migration-test' },
  });
  try {
    const database = await worker.getD1Database('DB');
    const [originalMigration, ...upgrades] = await migrationFiles();
    await applyMigration(database, originalMigration);
    await database.prepare(`INSERT INTO training_plans
      (id, owner_id, race_name, race_date, pace_guide, source_name, version, created_at, updated_at)
      VALUES ('original', 'owner', 'Original race', '2026-12-11', '[]', 'original.xlsx', 3, '2026-01-01', '2026-10-22')`).run();
    for (const [id, distance] of [['unknown', null], ['zero', 0], ['recorded', 5]]) {
      await database.prepare(`INSERT INTO workouts
        (id, plan_id, date, phase, type, planned_workout, target_pace, done,
         actual_distance, actual_pace, effort, pain, notes, source_row, original_source, version, updated_at)
        VALUES (?, 'original', '2026-10-22', 'Peak', 'Easy Run', '5 mi easy', 'Conversational', 1,
          ?, '12:00', 4, 'None', 'Original notes', 2, '{"source":"unchanged"}', 7, '2026-10-22')`)
        .bind(id, distance).run();
    }
    const beforePlans = (await database.prepare('SELECT * FROM training_plans ORDER BY id').all()).results;
    const beforeWorkouts = (await database.prepare('SELECT * FROM workouts ORDER BY id').all()).results;
    for (const migration of upgrades) await applyMigration(database, migration);
    const afterPlans = (await database.prepare('SELECT * FROM training_plans ORDER BY id').all()).results;
    assert.deepEqual(afterPlans.map(({ status, ...original }) => original), beforePlans);
    assert.equal(afterPlans[0].status, 'active');
    assert.deepEqual((await database.prepare('SELECT * FROM workouts ORDER BY id').all()).results, beforeWorkouts);

    const insertBlock = (id, owner, status) => database.prepare(`INSERT INTO training_plans
      (id, owner_id, status, race_name, race_date, pace_guide, created_at, updated_at)
      VALUES (?, ?, ?, 'Next goal', '2027-05-01', '[]', '2026-10-23', '2026-10-23')`).bind(id, owner, status).run();
    await insertBlock('draft', 'owner', 'draft');
    await insertBlock('completed', 'owner', 'completed');
    await insertBlock('archived', 'owner', 'archived');
    await insertBlock('other-active', 'other-owner', 'active');
    await assert.rejects(insertBlock('second-active', 'owner', 'active'), /UNIQUE/);
    await assert.rejects(database.prepare("DELETE FROM training_plans WHERE id = 'original'").run(), /FOREIGN KEY/);
    assert.deepEqual((await database.prepare('PRAGMA foreign_key_check').all()).results, []);
    const queryPlan = (await database.prepare(`EXPLAIN QUERY PLAN SELECT * FROM training_plans
      WHERE owner_id = 'owner' ORDER BY created_at, id`).all()).results;
    assert.ok(queryPlan.some((row) => row.detail.includes('training_plans_owner_created_idx')));
  } finally {
    await worker.dispose();
  }
});

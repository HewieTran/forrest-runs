import assert from 'node:assert/strict';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { Miniflare, applyAllMigrations } from './d1-helpers.mjs';

// Entire suite uses a disposable local D1 and synthetic identities only.
export async function testBlocks(db, dispatch) {
  const identity = { 'oai-authenticated-user-id': 'integration-owner', 'oai-authenticated-user-email': 'test-runner@example.test' };
  const other = { 'oai-authenticated-user-id': 'integration-other', 'oai-authenticated-user-email': 'other@example.test' };
  async function call(path, method = 'GET', body, auth = identity) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  const initial = (await call('/api/training')).data;
  const originalId = initial.plan.id;
  const originalWorkout = initial.workouts[0];
  const settings = { raceName: 'Next goal', raceDate: '2027-05-01', version: 1 };
  for (const status of ['draft', 'completed', 'archived']) {
    await db.prepare(`INSERT INTO training_plans (id, owner_id, status, race_name, race_date, pace_guide, created_at, updated_at)
      VALUES (?, 'integration-owner', ?, 'Next goal', '2027-05-01', '[]', '2026-10-23T00:00:00.000Z', '2026-10-23T00:00:00.000Z')`).bind(status, status).run();
  }
  const listing = await call('/api/blocks');
  assert.equal(listing.status, 200);
  assert.deepEqual(new Set(listing.data.blocks.map(b => b.status)), new Set(['active', 'draft', 'completed', 'archived']));
  assert.equal(listing.data.blocks.length, 4);
  assert.ok(listing.data.blocks.every(b => !('ownerId' in b)));
  assert.equal(listing.headers.get('cache-control'), 'private, no-store');
  assert.equal((await call('/api/blocks', 'GET', undefined, {})).status, 401);
  assert.equal((await call('/api/training')).data.plan.id, originalId);
  const scoped = '/api/training?blockId=draft';
  assert.equal((await call(scoped)).data.workouts.length, 0);
  assert.equal((await call('/api/training?blockId=draft&blockId=completed')).status, 400);
  assert.equal((await call('/api/training?blockId=')).status, 400);

  const fresh = { 'oai-authenticated-user-id': 'unknown-read', 'oai-authenticated-user-email': 'unknown@example.test' };
  assert.equal((await call('/api/training?blockId=missing', 'GET', undefined, fresh)).status, 404);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM training_plans WHERE owner_id = 'unknown-read'").first()).count, 0);
  const foreignId = (await call('/api/training', 'GET', undefined, other)).data.plan.id;
  const foreignQuery = '?blockId=' + encodeURIComponent(foreignId);
  assert.equal((await call('/api/training' + foreignQuery)).status, 404);
  assert.equal((await call('/api/training' + foreignQuery, 'PATCH', settings)).status, 404);
  assert.equal((await call('/api/workouts' + foreignQuery, 'POST', originalWorkout)).status, 404);
  assert.equal((await call('/api/workouts/' + encodeURIComponent(originalWorkout.id) + foreignQuery, 'PATCH', originalWorkout)).status, 404);
  assert.equal((await call('/api/export' + foreignQuery)).status, 404);
  assert.equal((await call('/api/training', 'PATCH', settings)).status, 409);
  assert.equal((await call('/api/workouts', 'POST', originalWorkout)).status, 409);
  assert.equal((await call('/api/workouts/' + encodeURIComponent(originalWorkout.id), 'PATCH', originalWorkout)).status, 409);
  console.log('PASS: block listing, default selection, ownership, invalid IDs, and ambiguous old-tab protection.');

  const savedSettings = await call(scoped, 'PATCH', settings);
  assert.equal(savedSettings.status, 200);
  assert.equal(savedSettings.data.plan.id, 'draft');
  assert.equal(savedSettings.data.plan.version, 2);
  assert.equal((await call(scoped, 'PATCH', settings)).status, 409);
  assert.deepEqual((await call('/api/training')).data.plan, initial.plan);
  const created = await call('/api/workouts?blockId=draft', 'POST', { ...originalWorkout, planId: foreignId, actualDistance: 0, sourceRow: 999, originalSource: { spoof: true }, notes: 'New draft note' });
  assert.equal(created.status, 201);
  assert.equal(created.data.workout.planId, 'draft');
  assert.equal(created.data.workout.sourceRow, null);
  assert.equal(created.data.workout.originalSource, null);
  const editUrl = '/api/workouts/' + encodeURIComponent(created.data.workout.id) + '?blockId=draft';
  const edited = await call(editUrl, 'PATCH', { ...created.data.workout, notes: 'Updated draft note', actualDistance: null });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.workout.version, 2);
  assert.equal((await call(editUrl, 'PATCH', created.data.workout)).status, 409);
  assert.equal((await call('/api/workouts/' + encodeURIComponent(originalWorkout.id) + '?blockId=draft', 'PATCH', originalWorkout)).status, 409);
  assert.equal((await call(scoped)).data.workouts[0].notes, 'Updated draft note');
  assert.deepEqual((await call('/api/training')).data.workouts, initial.workouts);
  console.log('PASS: block-scoped settings and workouts, spoofed ownership fields, and version conflicts.');

  const all = await call('/api/export');
  assert.equal(all.status, 200);
  assert.equal(all.data.schemaVersion, 2);
  assert.equal(all.data.blocks.length, 4);
  assert.equal(all.data.workouts.length, 159);
  assert.ok(!JSON.stringify(all.data).includes(foreignId));
  assert.deepEqual(normalizeTrainingBackup(all.data), all.data);
  const legacy = await call('/api/export?blockId=' + encodeURIComponent(originalId));
  assert.equal(legacy.data.schemaVersion, 1);
  assert.equal(legacy.data.plan.id, originalId);
  assert.equal(legacy.data.workouts.length, 158);
  await testRestore(all.data);
  await testRestore(legacy.data);
  console.log('PASS: complete account export, legacy single-block export, and isolated restore rehearsal for both formats.');

  await db.batch([
    db.prepare("UPDATE training_plans SET status = 'completed' WHERE id = ?").bind(originalId),
    db.prepare("UPDATE training_plans SET status = 'active' WHERE id = 'draft'"),
  ]);
  assert.equal((await call('/api/training')).data.plan.id, 'draft');
  const pinnedEdit = await call('/api/workouts/' + encodeURIComponent(originalWorkout.id) + '?blockId=' + encodeURIComponent(originalId), 'PATCH', { ...originalWorkout, notes: 'Saved to the block originally viewed' });
  assert.equal(pinnedEdit.status, 200);
  assert.equal(pinnedEdit.data.workout.planId, originalId);
  assert.equal((await call(scoped)).data.workouts[0].notes, 'Updated draft note');
  assert.equal((await call('/api/workouts/' + encodeURIComponent(originalWorkout.id), 'PATCH', pinnedEdit.data.workout)).status, 409);
  await db.prepare("UPDATE training_plans SET status = 'draft' WHERE id = 'draft'").run();
  const expectedFallback = await db.prepare("SELECT id FROM training_plans WHERE owner_id = 'integration-owner' ORDER BY created_at, id LIMIT 1").first();
  assert.equal((await call('/api/training')).data.plan.id, expectedFallback.id);
  assert.equal((await call('/api/blocks')).data.blocks.length, 4);
  const concurrent = { 'oai-authenticated-user-id': 'concurrent-owner', 'oai-authenticated-user-email': 'test-runner@example.test' };
  const firstLoads = await Promise.all(Array.from({ length: 3 }, () => call('/api/training', 'GET', undefined, concurrent)));
  assert.ok(firstLoads.every(result => result.status === 200 && result.data.workouts.length === 158));
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM training_plans WHERE owner_id = 'concurrent-owner'").first()).count, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM workouts WHERE plan_id = 'plan:concurrent-owner'").first()).count, 158);
  console.log('PASS: saves remain pinned after an active-block switch, deterministic fallback, and concurrent first-load import.');
}

async function testRestore(input) {
  const backup = normalizeTrainingBackup(input);
  const worker = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-15', cf: false, d1Databases: { DB: 'backup-restore-test' } });
  try {
    const db = await worker.getD1Database('DB');
    await applyAllMigrations(db);
    const statements = [];
    for (const block of backup.blocks) statements.push(db.prepare(`INSERT INTO training_plans
      (id,owner_id,status,race_name,race_date,pace_guide,source_name,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(block.id, 'verified-restore-owner', block.status, block.raceName, block.raceDate, JSON.stringify(block.paceGuide), block.sourceName, block.version, block.createdAt, block.updatedAt));
    for (const w of backup.workouts) statements.push(db.prepare(`INSERT INTO workouts
      (id,plan_id,date,phase,type,planned_workout,target_pace,done,actual_distance,actual_pace,effort,pain,notes,source_row,original_source,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(w.id, w.planId, w.date, w.phase, w.type, w.plannedWorkout, w.targetPace, Number(w.done), w.actualDistance, w.actualPace, w.effort, w.pain, w.notes, w.sourceRow, w.originalSource === null ? null : JSON.stringify(w.originalSource), w.version, w.updatedAt));
    await db.batch(statements);
    const columns = 'id, status, race_name AS raceName, race_date AS raceDate, pace_guide AS paceGuide, source_name AS sourceName, version, created_at AS createdAt, updated_at AS updatedAt';
    const blocks = (await db.prepare('SELECT ' + columns + ' FROM training_plans ORDER BY id').all()).results.map(b => ({ ...b, paceGuide: JSON.parse(b.paceGuide) }));
    assert.deepEqual(blocks, [...backup.blocks].sort((a, b) => a.id.localeCompare(b.id)));
    const workouts = (await db.prepare(`SELECT id,plan_id AS planId,date,phase,type,planned_workout AS plannedWorkout,target_pace AS targetPace,done,actual_distance AS actualDistance,actual_pace AS actualPace,effort,pain,notes,source_row AS sourceRow,original_source AS originalSource,version,updated_at AS updatedAt FROM workouts ORDER BY id`).all()).results.map(w => ({ ...w, done: Boolean(w.done), originalSource: w.originalSource === null ? null : JSON.parse(w.originalSource) }));
    const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    assert.deepEqual(workouts, [...backup.workouts].sort(byId));
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await worker.dispose(); }
}

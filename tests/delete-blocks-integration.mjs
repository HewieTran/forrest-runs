import assert from 'node:assert/strict';
import { insertExistingTestBlock } from './d1-helpers.mjs';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { plannerFixture } from './planner-fixture.mjs';
import { centralToday } from '../lib/domain.ts';

export async function testDeleteBlocks(db, dispatch) {
  const auth = { 'oai-authenticated-user-id': 'delete-owner', 'oai-authenticated-user-email': 'delete@example.test' };
  const other = { 'oai-authenticated-user-id': 'delete-other', 'oai-authenticated-user-email': 'other@example.test' };
  async function call(path, method = 'GET', body, identity = auth) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...identity, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  async function preview(block) { const result = await call('/api/blocks/' + encodeURIComponent(block.id)); assert.equal(result.status, 200); return result.data.deletion; }
  function confirm(d) { return { version: d.version, confirmation: d.name, revision: d.revision }; }
  await insertExistingTestBlock(db, auth);
  const original = (await call('/api/training')).data.plan;
  let block = (await call('/api/blocks', 'POST', { raceName: 'Disposable test block', raceDate: '2027-01-24' })).data.block;
  const path = '/api/blocks/' + block.id;
  const libraryPage = await dispatch('http://localhost/blocks', { headers: auth });
  const libraryHtml = await libraryPage.text();
  assert.doesNotMatch(libraryHtml, /Permanently delete block/);
  const settingsPage = await dispatch('http://localhost/blocks/' + block.id + '/settings', { headers: auth });
  const settingsHtml = await settingsPage.text();
  assert.match(settingsHtml, /Delete Disposable test block/);
  assert.match(settingsHtml, /Permanently delete block/);
  let details = await preview(block);
  assert.equal((await call(path, 'GET', undefined, {})).status, 401);
  assert.equal((await call(path, 'GET', undefined, other)).status, 404);
  assert.equal((await call(path, 'DELETE', confirm(details), {})).status, 401);
  assert.equal((await call(path, 'DELETE', confirm(details), other)).status, 404);
  assert.equal((await call(path, 'DELETE', { ...confirm(details), confirmation: 'Wrong name' })).status, 400);
  const workoutInput = { date: '2027-01-02', phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Example run', targetPace: '', done: false, actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', version: 1 };
  let w = (await call('/api/workouts?blockId=' + block.id, 'POST', workoutInput)).data.workout;
  // Even manual workout changes that do not bump the block version invalidate
  // an earlier delete confirmation.
  assert.equal((await call(path, 'DELETE', confirm(details))).status, 409);
  details = await preview(block);
  w = (await call('/api/workouts/' + w.id + '?blockId=' + block.id, 'PATCH', { ...w, notes: 'New result note' })).data.workout;
  assert.equal((await call(path, 'DELETE', confirm(details))).status, 409);
  const rest = (await call(path + '/rest-days', 'POST', { date: '2027-01-03' })).data.restDay;
  details = await preview(block);
  assert.equal(details.workoutCount, 1); assert.equal(details.restDayCount, 1);
  await call(path + '/rest-days/' + rest.id, 'DELETE', { version: rest.version });
  await call(path + '/rest-days', 'POST', { date: rest.date });
  assert.equal((await call(path, 'DELETE', confirm(details))).status, 409); // new ID, same date/version
  details = await preview(block);
  // A late failure must restore parent, children, versions and generation data.
  const before = (await call('/api/training?blockId=' + block.id)).data;
  await db.prepare(`CREATE TRIGGER test_delete_failure BEFORE DELETE ON training_plans WHEN OLD.id = '${block.id}' BEGIN SELECT RAISE(ABORT, 'synthetic deletion failure'); END`).run();
  try {
    assert.equal((await call(path, 'DELETE', confirm(details))).status, 500);
    assert.deepEqual((await call('/api/training?blockId=' + block.id)).data, before);
  } finally { await db.prepare('DROP TRIGGER test_delete_failure').run(); }
  const racing = await Promise.all([call(path, 'DELETE', confirm(details)), call(path, 'DELETE', confirm(details))]);
  assert.equal(racing.filter(r => r.status === 200).length, 1);
  assert.ok(racing.every(r => [200, 404, 409].includes(r.status)));
  assert.equal((await call(path)).status, 404);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM workouts WHERE plan_id=?').bind(block.id).first()).count, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM training_rest_days WHERE plan_id=?').bind(block.id).first()).count, 0);
  assert.deepEqual((await call('/api/training')).data.plan, original);
  // A guided intake draft can be removed directly from the library.
  const guided = (await call('/api/blocks', 'POST', { setup: plannerFixture(centralToday()).setup, complete: true })).data.block;
  assert.equal((await call('/api/blocks/' + guided.id, 'DELETE', confirm(await preview(guided)))).status, 200);
  // Legacy generated records lack account initialization state. Deletion must
  // preserve a marker while alteration triggers increment parent versions.
  const fixture = plannerFixture(centralToday());
  const generation = { provider: 'simulation', status: 'accepted', alteredAt: null };
  await db.prepare("INSERT INTO training_plans (id,owner_id,status,race_name,race_date,pace_guide,setup,generation,created_at,updated_at) VALUES ('legacy-delete','delete-owner','draft','Legacy simulation','2027-01-24','[]',?,?,?,?)").bind(JSON.stringify(fixture.setup), JSON.stringify(generation), new Date().toISOString(), new Date().toISOString()).run();
  await db.prepare("INSERT INTO workouts (id,plan_id,date,phase,type,planned_workout,target_pace,updated_at) VALUES ('legacy-delete-workout','legacy-delete','2027-01-01','Base Build','Easy Run','SIMULATION example','easy',?)").bind(new Date().toISOString()).run();
  const generatedDetails = (await call('/api/blocks/legacy-delete')).data.deletion;
  assert.equal((await call('/api/blocks/legacy-delete', 'DELETE', confirm(generatedDetails))).status, 200);
  // Active block protection, then deletion of the last remaining block.
  assert.equal((await call('/api/blocks/' + encodeURIComponent(original.id), 'DELETE', confirm(await preview(original)))).status, 409);
  const archived = (await call('/api/blocks/' + encodeURIComponent(original.id), 'PATCH', { status: 'archived', version: original.version })).data.block;
  assert.equal((await call('/api/blocks/' + encodeURIComponent(archived.id), 'DELETE', confirm(await preview(archived)))).status, 200);
  for (let i=0;i<2;i++) assert.deepEqual((await call('/api/blocks')).data.blocks, []);
  const emptyBackup = (await call('/api/export')).data;
  assert.deepEqual(emptyBackup.blocks, []);
  assert.deepEqual(normalizeTrainingBackup(emptyBackup), emptyBackup);
  assert.equal((await call('/api/training')).status, 404);
  assert.equal((await dispatch('http://localhost/blocks', { headers: auth })).status, 200);
  const next = (await call('/api/blocks', 'POST', { raceName: 'Fresh after deletion', raceDate: '2027-03-01' })).data.block;
  assert.equal(next.status, 'draft');
  assert.equal((await call('/api/blocks')).data.blocks.length, 1);
  // Accounts that existed before the marker migration also stay empty.
  const legacyAuth = { 'oai-authenticated-user-id': 'legacy-empty-owner', 'oai-authenticated-user-email': 'test-runner@example.test' };
  await db.prepare("INSERT INTO training_plans (id,owner_id,status,race_name,race_date,pace_guide,created_at,updated_at) VALUES ('legacy-last','legacy-empty-owner','archived','Legacy last','2027-01-24','[]','2026-10-24','2026-10-24')").run();
  const legacyPreview = (await call('/api/blocks/legacy-last', 'GET', undefined, legacyAuth)).data.deletion;
  assert.equal((await call('/api/blocks/legacy-last', 'DELETE', confirm(legacyPreview), legacyAuth)).status, 200);
  assert.deepEqual((await call('/api/blocks', 'GET', undefined, legacyAuth)).data.blocks, []);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  console.log('PASS: permanent deletion enforces ownership/name/snapshot checks, rejects changed workouts/rests, rolls back late failures, handles generated triggers, protects active blocks and never reimports after the last deletion.');
}

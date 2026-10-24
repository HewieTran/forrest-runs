import assert from 'node:assert/strict';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { summarize } from '../lib/domain.ts';
import { emptySetup } from '../lib/setup.ts';
import { testRestore } from './blocks-integration.mjs';

// Real built Worker handlers against disposable D1; never call a hosted Site.
export async function testWorkoutContract(db, dispatch) {
  const owner = { 'oai-authenticated-user-id': 'measurements-owner', 'oai-authenticated-user-email': 'measurements@example.test' };
  const other = { 'oai-authenticated-user-id': 'measurements-other', 'oai-authenticated-user-email': 'other@example.test' };
  async function call(path, method = 'GET', body, headers = owner) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  const initial = (await call('/api/training')).data;
  const blockId = initial.plan.id, scope = '?blockId=' + encodeURIComponent(blockId);
  const restPath = '/api/blocks/' + encodeURIComponent(blockId) + '/rest-days';
  const workout = { date: '2026-12-31', phase: 'Peak', type: 'Easy Run', plannedWorkout: 'Easy running', targetPace: 'Conversational', done: true, actualDistance: 5, actualPace: '', effort: null, pain: '', notes: '', version: 1 };
  const measurements = { plannedDistance: 5, plannedDurationSeconds: 3600, actualDurationSeconds: 0, targetMetric: 'distance' };
  assert.deepEqual(initial.restDays, []);
  assert.equal((await call('/api/workouts' + scope, 'POST', { ...workout, ...measurements }, {})).status, 401);
  const created = await call('/api/workouts' + scope, 'POST', { ...workout, ...measurements });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  let saved = created.data.workout;
  const editPath = '/api/workouts/' + encodeURIComponent(saved.id) + scope;
  for (const [key, value] of Object.entries(measurements)) assert.equal(saved[key], value);
  const oldClient = { ...saved, notes: 'Saved by an old form' };
  for (const key of Object.keys(measurements)) delete oldClient[key];
  const legacySave = await call(editPath, 'PATCH', oldClient);
  assert.equal(legacySave.status, 200);
  saved = legacySave.data.workout;
  for (const [key, value] of Object.entries(measurements)) assert.equal(saved[key], value, 'Legacy form erased ' + key);
  assert.equal((await call(editPath, 'PATCH', oldClient)).status, 409);
  for (const fields of [
    { plannedDistance: 6 }, { actualDurationSeconds: -1 }, { actualDurationSeconds: 1.5 },
    { plannedDistance: null, plannedDurationSeconds: null, targetMetric: 'duration' },
    { plannedDistance: 5, plannedDurationSeconds: null, targetMetric: 'pace' },
  ]) assert.equal((await call(editPath, 'PATCH', { ...oldClient, version: saved.version, ...fields })).status, 400);
  assert.equal((await call(editPath, 'PATCH', saved, other)).status, 404);
  const cleared = await call(editPath, 'PATCH', { ...saved, plannedDistance: null, plannedDurationSeconds: null, actualDurationSeconds: null, targetMetric: null });
  assert.equal(cleared.status, 200);
  const restored = await call(editPath, 'PATCH', { ...cleared.data.workout, ...measurements });
  assert.equal(restored.status, 200);
  saved = restored.data.workout;
  const reloaded = (await call('/api/training' + scope)).data.workouts[0];
  for (const [key, value] of Object.entries(measurements)) assert.equal(reloaded[key], value);
  console.log('PASS: numeric targets, duration zero/null, reload, partial-input rejection, legacy-save preservation, ownership, and stale versions.');

  assert.equal((await call(restPath, 'POST', { date: '2027-01-01' }, {})).status, 401);
  assert.equal((await call(restPath, 'POST', { date: '2027-01-01' }, other)).status, 404);
  assert.equal((await call('/api/blocks/missing/rest-days', 'POST', { date: '2027-01-01' })).status, 404);
  assert.equal((await call(restPath, 'POST', { date: '2027-02-29' })).status, 400);
  assert.equal((await call(restPath, 'POST', { date: workout.date })).status, 409);
  const restResult = await call(restPath, 'POST', { date: '2027-01-01', planId: 'foreign', id: 'spoofed', version: 99 });
  assert.equal(restResult.status, 201, JSON.stringify(restResult.data));
  let rest = restResult.data.restDay;
  assert.equal(rest.planId, blockId); assert.notEqual(rest.id, 'spoofed'); assert.equal(rest.version, 1);
  assert.equal((await call(restPath, 'POST', { date: rest.date })).status, 409);
  assert.equal((await call('/api/workouts' + scope, 'POST', { ...workout, date: rest.date })).status, 409);
  assert.equal((await call(editPath, 'PATCH', { ...saved, date: rest.date })).status, 409);
  const scheduled = (await call('/api/training' + scope)).data;
  assert.equal(scheduled.restDays.length, 1);
  assert.equal(scheduled.workouts.length, 1);
  assert.equal(summarize(scheduled.workouts, '2027-01-02').total, 1);
  const card = (await call('/api/blocks')).data.blocks.find(b => b.id === blockId);
  assert.deepEqual([card.workoutCount, card.completedCount, card.recordedMiles], [1, 1, 5]);
  assert.equal((await call('/api/training' + scope, 'GET', undefined, other)).status, 404);
  console.log('PASS: explicit cross-year rest dates stay out of workout totals and reject conflicting creates/reschedules without leaking another account.');

  const removePath = id => restPath + '/' + encodeURIComponent(id);
  assert.equal((await call(removePath(rest.id), 'DELETE', { version: rest.version }, other)).status, 404);
  assert.equal((await call(removePath(rest.id), 'DELETE', { version: 2 })).status, 409);
  assert.equal((await call(removePath(rest.id), 'DELETE', { version: rest.version })).status, 200);
  const previousId = rest.id;
  rest = (await call(restPath, 'POST', { date: rest.date })).data.restDay;
  assert.notEqual(rest.id, previousId);
  assert.equal((await call(removePath(previousId), 'DELETE', { version: 1 })).status, 409);
  const raceDate = '2027-01-02';
  const conflict = await Promise.all([
    call(restPath, 'POST', { date: raceDate }),
    call('/api/workouts' + scope, 'POST', { ...workout, date: raceDate }),
  ]);
  assert.deepEqual(conflict.map(r => r.status).sort(), [201, 409]);
  const rowsOnDate = (await db.prepare('SELECT (SELECT count(*) FROM workouts WHERE plan_id = ? AND date = ?) + (SELECT count(*) FROM training_rest_days WHERE plan_id = ? AND date = ?) AS count').bind(blockId, raceDate, blockId, raceDate).first()).count;
  assert.equal(rowsOnDate, 1);
  const concurrent = await Promise.all([call(restPath, 'POST', { date: '2027-01-03' }), call(restPath, 'POST', { date: '2027-01-03' })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  console.log('PASS: stale rest removal, delete/recreate identity protection, competing rest requests, and atomic workout/rest exclusivity.');

  const partial = emptySetup('Guided draft', '2027-05-01');
  const guided = (await call('/api/blocks', 'POST', { setup: partial })).data.block;
  assert.equal((await call('/api/blocks/' + guided.id + '/rest-days', 'POST', { date: '2027-01-05' })).status, 409);
  const manual = (await call('/api/blocks', 'POST', { raceName: 'Manual rest schedule', raceDate: '2027-05-01' })).data.block;
  const manualPath = '/api/blocks/' + manual.id;
  assert.equal((await call(manualPath + '/rest-days', 'POST', { date: '2027-01-05' })).status, 201);
  assert.equal((await call(manualPath + '/setup', 'PUT', { setup: partial, version: manual.version })).status, 409);
  const racing = (await call('/api/blocks', 'POST', { raceName: 'Setup rest race', raceDate: '2027-05-01' })).data.block;
  const setupRace = await Promise.all([
    call('/api/blocks/' + racing.id + '/rest-days', 'POST', { date: '2027-01-06' }),
    call('/api/blocks/' + racing.id + '/setup', 'PUT', { setup: partial, version: racing.version }),
  ]);
  assert.equal(setupRace.filter(r => [200, 201].includes(r.status)).length, 1);
  assert.equal(setupRace.filter(r => r.status === 409).length, 1);
  console.log('PASS: guided setup guards include rest schedules, including concurrent first schedule/setup writes.');

  for (const path of ['/api/export', '/api/export' + scope]) {
    const exported = await call(path);
    assert.equal(exported.status, 200); assert.equal(exported.data.schemaVersion, 4);
    assert.ok(exported.data.restDays.some(r => r.id === rest.id));
    assert.ok(exported.data.workouts.some(w => w.id === saved.id && w.plannedDistance === 5 && w.actualDurationSeconds === 0));
    if (path.includes('?')) assert.equal(exported.data.blocks.length, 1);
    assert.ok(exported.data.restDays.every(r => exported.data.blocks.some(b => b.id === r.planId)));
    assert.deepEqual(normalizeTrainingBackup(exported.data), exported.data);
    await testRestore(exported.data);
  }
  console.log('PASS: account/block v4 backups restore exact targets, duration results, and rest records into a separate database.');
}

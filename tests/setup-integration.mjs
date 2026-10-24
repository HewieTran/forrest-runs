import assert from 'node:assert/strict';
import { emptySetup, setupForEditing } from '../lib/setup.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { exampleSetup, legacySetup } from './setup-fixture.mjs';
import { addDays, centralToday } from '../lib/domain.ts';
import { testRestore } from './blocks-integration.mjs';

export async function testSetup(db, dispatch) {
  const auth = { 'oai-authenticated-user-id': 'setup-owner', 'oai-authenticated-user-email': 'setup@example.test' };
  const other = { 'oai-authenticated-user-id': 'setup-foreign', 'oai-authenticated-user-email': 'foreign@example.test' };
  async function call(path, method = 'GET', body, headers = auth) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  const original = (await call('/api/training')).data.plan;
  const partial = emptySetup('Unfinished goal', '2027-05-01'); partial.step = 1;
  const created = await call('/api/blocks', 'POST', { setup: partial, complete: false, ownerId: 'foreign', status: 'active' });
  assert.equal(created.status, 201);
  let block = created.data.block;
  assert.equal(block.status, 'draft');
  assert.deepEqual(block.setup, partial);
  const path = '/api/blocks/' + encodeURIComponent(block.id) + '/setup';
  assert.equal((await call(path, 'GET', undefined, {})).status, 401);
  assert.equal((await call(path, 'GET', undefined, other)).status, 404);
  assert.equal((await call(path, 'PUT', { setup: partial, version: 1 }, other)).status, 404);
  assert.equal((await call(path, 'PUT', { setup: partial, version: 1 }, {})).status, 401);
  assert.equal((await call('/api/blocks', 'POST', { setup: partial, complete: true })).status, 400);
  assert.equal((await call(path, 'PUT', { setup: partial, version: 1, complete: true })).status, 400);
  assert.deepEqual((await call(path)).data.block.setup, partial);
  assert.equal('ownerId' in (await call(path)).data.block, false);
  const card = (await call('/api/blocks')).data.blocks.find(item => item.id === block.id);
  assert.equal(card.hasSetup, true);
  assert.equal('setup' in card, false);
  assert.equal((await call('/api/training')).data.plan.id, original.id);
  console.log('PASS: incomplete setup saves/resumes, required-result validation, account isolation, and compact library metadata.');

  const complete = exampleSetup();
  const saved = await call(path, 'PUT', { setup: complete, version: block.version, complete: true });
  assert.equal(saved.status, 200);
  block = saved.data.block;
  assert.equal(block.version, 2);
  assert.equal(block.raceName, complete.goal.name);
  assert.equal(block.raceDate, complete.goal.targetDate);
  assert.deepEqual((await call(path)).data.block.setup, complete);
  assert.equal((await call(path, 'PUT', { setup: partial, version: 1 })).status, 409);
  const competing = await Promise.all([call(path, 'PUT', { setup: complete, version: 2 }), call(path, 'PUT', { setup: complete, version: 2 })]);
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  block = competing.find(result => result.status === 200).data.block;
  const workout = { date: '2026-10-23', phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Easy running', targetPace: '', done: false, actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', version: 1 };
  assert.equal((await call('/api/workouts?blockId=' + encodeURIComponent(block.id), 'POST', workout)).status, 409);
  assert.equal((await call('/api/blocks/' + encodeURIComponent(original.id), 'PATCH', { status: 'completed', version: original.version })).status, 200);
  assert.equal((await call('/api/blocks/' + encodeURIComponent(block.id), 'PATCH', { status: 'active', version: block.version })).status, 409);
  assert.equal((await call('/api/training?blockId=' + encodeURIComponent(block.id))).data.workouts.length, 0);
  const archived = await call('/api/blocks/' + encodeURIComponent(block.id), 'PATCH', { status: 'archived', version: block.version });
  assert.equal(archived.status, 200);
  block = archived.data.block;
  assert.equal((await call(path, 'PUT', { setup: complete, version: block.version })).status, 409);
  assert.deepEqual((await call(path)).data.block.setup, complete);
  const backup = (await call('/api/export')).data;
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  assert.deepEqual(backup.blocks.find(item => item.id === block.id).setup, complete);
  await testRestore(backup);
  console.log('PASS: complete snapshots, stale/concurrent edit protection, archived snapshot preservation, activation gate, and backup restore.');

  const manual = (await call('/api/blocks', 'POST', { raceName: 'Manual race', raceDate: '2027-05-01' })).data.block;
  const racePath = '/api/blocks/' + encodeURIComponent(manual.id) + '/setup';
  const race = await Promise.all([
    call(racePath, 'PUT', { setup: complete, version: manual.version }),
    call('/api/workouts?blockId=' + encodeURIComponent(manual.id), 'POST', workout),
  ]);
  assert.equal(race.filter(result => [200, 201].includes(result.status)).length, 1);
  assert.equal(race.filter(result => result.status === 409).length, 1);
  const raceBlock = (await call('/api/training?blockId=' + encodeURIComponent(manual.id))).data;
  assert.equal(Boolean(raceBlock.plan.setup), raceBlock.workouts.length === 0);
  const populated = (await call('/api/blocks', 'POST', { raceName: 'Existing schedule', raceDate: '2027-05-01' })).data.block;
  assert.equal((await call('/api/workouts?blockId=' + encodeURIComponent(populated.id), 'POST', workout)).status, 201);
  assert.equal((await call('/api/blocks/' + encodeURIComponent(populated.id) + '/setup', 'PUT', { setup: complete, version: populated.version })).status, 409);
  const newPage = await dispatch('http://localhost/blocks/new', { headers: auth });
  assert.equal(newPage.status, 200);
  assert.ok((await newPage.text()).includes('Setup steps'));
  const setupPage = await dispatch('http://localhost/blocks/' + encodeURIComponent(block.id) + '/setup', { headers: auth });
  assert.ok((await setupPage.text()).includes('Saved snapshot'));
  const forbiddenPage = await dispatch('http://localhost/blocks/' + encodeURIComponent(block.id) + '/setup', { headers: other });
  assert.ok(!(await forbiddenPage.text()).includes('class="setup-panel"'));
  const encodedId = 'setup:legacy%3A-id';
  await db.prepare(`INSERT INTO training_plans
    (id,owner_id,status,race_name,race_date,pace_guide,created_at,updated_at,setup)
    VALUES (?,'setup-owner','draft','Encoded setup','2027-03-14','[]','2026-10-23T00:00:00.000Z','2026-10-23T00:00:00.000Z',?)`).bind(encodedId, JSON.stringify(complete)).run();
  const encodedPath = '/blocks/' + encodeURIComponent(encodedId) + '/setup';
  const encodedPage = await dispatch('http://localhost' + encodedPath, { headers: auth });
  assert.ok((await encodedPage.text()).includes('class="setup-panel"'));
  assert.deepEqual((await call('/api' + encodedPath)).data.block.setup, complete);
  const encodedForeign = await dispatch('http://localhost' + encodedPath, { headers: other });
  assert.ok(!(await encodedForeign.text()).includes('class="setup-panel"'));
  console.log('PASS: atomic setup/workout race, protection of existing schedules, and authenticated guided setup pages.');

  // Revised intake accepts an effort-based goal without optional measurements,
  // a race result, a manually typed name or a preferred long-run day.
  const effort = exampleSetup();
  effort.runner = emptySetup().runner;
  effort.goal.name = ''; effort.goal.mode = 'finish'; effort.goal.paceGuidance = 'effort'; effort.goal.targetTime = '';
  effort.baseline.results = emptySetup().baseline.results;
  effort.availability.longRunDay = null;
  const effortCreated = await call('/api/blocks', 'POST', { setup: effort, complete: true });
  assert.equal(effortCreated.status, 201);
  assert.equal(effortCreated.data.block.raceName, '5K training · 2027-03-14');
  const effortPath = '/api/blocks/' + encodeURIComponent(effortCreated.data.block.id) + '/setup';
  const performance = structuredClone(effort); performance.goal.paceGuidance = 'performance';
  assert.equal((await call(effortPath, 'PUT', { setup: performance, complete: true, version: 1 })).status, 400);
  assert.equal((await call(effortPath)).data.block.version, 1);
  const invalidLimit = structuredClone(effort); invalidLimit.availability.maxSessionDurationSeconds = '2700';
  assert.equal((await call(effortPath, 'PUT', { setup: invalidLimit, version: 1 })).status, 400);
  const invalidOverride = structuredClone(effort); invalidOverride.availability.dayDurationLimits = { '0': 3600 };
  assert.equal((await call(effortPath, 'PUT', { setup: invalidOverride, version: 1 })).status, 400);
  assert.deepEqual((await call(effortPath)).data.block.setup.availability.dayDurationLimits, { '6': 5400 });

  // Loading and backing up an old snapshot never rewrites it. Upgrades are
  // explicit saves, and a fresh-version old client cannot erase new fields.
  const legacy = legacySetup();
  const legacyCreated = await call('/api/blocks', 'POST', { setup: legacy });
  assert.equal(legacyCreated.status, 201);
  const legacyPath = '/api/blocks/' + encodeURIComponent(legacyCreated.data.block.id) + '/setup';
  assert.deepEqual((await call(legacyPath)).data.block.setup, legacy);
  const upgraded = setupForEditing(legacy);
  const upgradedSaved = await call(legacyPath, 'PUT', { setup: upgraded, version: 1 });
  assert.equal(upgradedSaved.status, 200);
  assert.equal(upgradedSaved.data.block.setup.schemaVersion, 2);
  assert.equal(upgradedSaved.data.block.setup.availability.maxSessionDurationSeconds, null);
  assert.equal((await call(legacyPath, 'PUT', { setup: legacy, version: 2 })).status, 409);
  assert.deepEqual((await call(legacyPath)).data.block.setup, upgraded);
  const revisedBackup = (await call('/api/export')).data;
  assert.deepEqual(normalizeTrainingBackup(revisedBackup), revisedBackup);
  await testRestore(revisedBackup);
  console.log('PASS: optional runner data, effort/time/pace conditions, numeric session limits, v1 upgrade, downgrade rejection, and mixed-version backup restore.');

  const historyBlock = (await call('/api/blocks', 'POST', { raceName: 'Recorded baseline', raceDate: '2027-05-01' })).data.block;
  const foreignHistory = (await call('/api/blocks', 'POST', { raceName: 'Other history', raceDate: '2027-05-01' }, other)).data.block;
  const today = centralToday();
  for (const offset of [28, 21, 14, 7]) {
    const session = { ...workout, date: addDays(today, -offset), done: true, actualDistance: 4 };
    assert.equal((await call('/api/workouts?blockId=' + encodeURIComponent(historyBlock.id), 'POST', session)).status, 201);
    assert.equal((await call('/api/workouts?blockId=' + encodeURIComponent(foreignHistory.id), 'POST', { ...session, actualDistance: 100 }, other)).status, 201);
  }
  const historySetup = exampleSetup(); historySetup.step = 2; historySetup.units = 'mi';
  const ownedDraft = (await call('/api/blocks', 'POST', { setup: historySetup })).data.block;
  const ownedPage = await dispatch('http://localhost/blocks/' + encodeURIComponent(ownedDraft.id) + '/setup', { headers: auth });
  const ownedText = (await ownedPage.text()).replace(/<[^>]*>/g, '');
  assert.match(ownedText, /Use your recorded training/);
  assert.match(ownedText, /4 mi\/week, about 1 running days\/week/);
  assert.deepEqual((await call('/api/blocks/' + encodeURIComponent(ownedDraft.id) + '/setup')).data.block.setup, historySetup);
  console.log('PASS: recorded-history suggestions are scoped to the signed-in account and never modify the saved baseline.');

}

import assert from 'node:assert/strict';
import { insertExistingTestBlock } from './d1-helpers.mjs';
import { centralToday } from '../lib/domain.ts';
import { currentPlannerFixture as plannerFixture, responseFixture } from './planner-fixture.mjs';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { editWorkoutStep, structureMeasurements } from '../lib/workout-structure.ts';
import { testRestore } from './blocks-integration.mjs';

// Provider traffic is intercepted by Miniflare. These tests never use an API key
// or send fitness data to OpenAI. All account and workout data is synthetic.
export async function testPlanner(db, dispatch, mock) {
  const auth = { 'oai-authenticated-user-id': 'planner-owner', 'oai-authenticated-user-email': 'planner@example.test' };
  const other = { 'oai-authenticated-user-id': 'planner-other', 'oai-authenticated-user-email': 'other@example.test' };
  const { setup, output } = plannerFixture(centralToday());
  const pool = mock.get('https://api.openai.com');
  async function call(path, method = 'GET', body, headers = auth) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  async function create() { const result = await call('/api/blocks', 'POST', { setup, complete: true }); assert.equal(result.status, 201); return result.data.block; }
  async function cool() { await db.prepare("UPDATE training_ai_usage SET started_at = ? WHERE owner_id = 'planner-owner'").bind(new Date(Date.now() - 300000).toISOString()).run(); await db.prepare("UPDATE training_plans SET generation = json_set(generation, '$.startedAt', ?) WHERE owner_id = 'planner-owner' AND generation IS NOT NULL").bind(new Date(Date.now() - 300000).toISOString()).run(); }
  await insertExistingTestBlock(db, auth);
  const original = (await call('/api/training')).data;
  let block = await create();
  const path = '/api/blocks/' + encodeURIComponent(block.id), gen = path + '/generation';
  const payload = { version: block.version, consent: true };
  assert.equal((await call(gen, 'POST', payload, {})).status, 401);
  assert.equal((await call(gen, 'POST', payload, other)).status, 404);
  assert.equal((await call(gen, 'POST', { ...payload, consent: false })).status, 400);
  assert.equal((await call(gen, 'POST', { ...payload, version: 99 })).status, 409);
  assert.equal((await call(gen + '/accept', 'POST', { version: 1, generationId: 'invented' })).status, 409);
  pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(200, responseFixture(output));
  const racing = await Promise.all([call(gen, 'POST', payload), call(gen, 'POST', payload)]);
  assert.deepEqual(racing.map(r => r.status).sort(), [200, 409]);
  block = racing.find(r => r.status === 200).data.block;
  assert.equal(block.generation.status, 'review');
  assert.equal(block.generation.usage.inputTokens, 1000);
  assert.equal(block.generation.calculationVersion, 'duration-pace-v1');
  assert.equal(block.version, 3);
  assert.equal((await call('/api/training?blockId=' + encodeURIComponent(block.id))).data.workouts.length, 0);
  // GET requests only read the saved draft. With no provider interceptor left,
  // any hidden regeneration attempt would fail this assertion.
  const reopened = (await call(path + '/setup')).data.block;
  assert.deepEqual(reopened.generation, block.generation);
  assert.equal((await call(path, 'PATCH', { status: 'active', version: block.version })).status, 409);
  const page = await dispatch('http://localhost/blocks/' + encodeURIComponent(block.id) + '/plan', { headers: auth });
  assert.match(await page.text(), /Generated schedule/);
  assert.equal((await call(gen, 'POST', { version: block.version, consent: true })).status, 409); // cooldown
  const accept = { version: block.version, generationId: block.generation.id };
  assert.equal((await call(gen + '/accept', 'POST', { ...accept, version: 1 })).status, 409);
  assert.equal((await call(gen + '/accept', 'POST', accept, other)).status, 404);
  assert.equal((await call(gen + '/accept', 'POST', accept, {})).status, 401);
  const accepted = await Promise.all([call(gen + '/accept', 'POST', accept), call(gen + '/accept', 'POST', accept)]);
  assert.ok(accepted.some(result => result.status === 200));
  assert.ok(accepted.every(result => [200, 409].includes(result.status)));
  assert.equal((await call(gen + '/accept', 'POST', accept)).status, 200); // idempotent retry
  let data = (await call('/api/training?blockId=' + encodeURIComponent(block.id))).data;
  assert.equal(data.plan.status, 'draft');
  assert.equal(data.plan.generation.status, 'accepted');
  assert.equal(data.plan.generation.alteredAt, null);
  assert.equal(data.workouts.length, output.sessions.length);
  assert.equal(data.workouts.length + data.restDays.length, 29);
  assert.ok(data.workouts.every(w => !w.done && w.actualDistance === null && w.originalSource.generationId === accept.generationId));
  assert.deepEqual(data.plan.setup, setup);
  const card = (await call('/api/blocks')).data.blocks.find(b => b.id === block.id);
  assert.equal(card.hasGeneratedPlan, true);
  assert.equal('generation' in card, false);
  assert.equal((await call(path + '/setup', 'PUT', { setup, version: data.plan.version })).status, 409);
  await cool();
  assert.equal((await call(gen, 'POST', { version: data.plan.version, consent: true })).status, 409);
  const scope = '?blockId=' + encodeURIComponent(block.id);
  let workout = data.workouts[0];
  const workoutPath = '/api/workouts/' + encodeURIComponent(workout.id) + scope;
  let saved = await call(workoutPath, 'PATCH', { ...workout, done: true, actualDistance: 3, notes: 'Completed at easy effort' });
  assert.equal(saved.status, 200);
  workout = saved.data.workout;
  data = (await call('/api/training' + scope)).data;
  assert.equal(data.plan.generation.alteredAt, null);
  const planStructure = editWorkoutStep(workout.planStructure, 0, 'duration', 1900);
  const changedWorkout = { ...workout, planStructure, ...structureMeasurements(planStructure) };
  assert.equal((await call(workoutPath, 'PATCH', changedWorkout)).status, 409);
  saved = await call(workoutPath, 'PATCH', { ...changedWorkout, confirmPlanChange: true });
  assert.equal(saved.status, 200);
  data = (await call('/api/training' + scope)).data;
  assert.ok(data.plan.generation.alteredAt);
  assert.deepEqual(data.plan.generation.output, output);
  assert.equal((await call(workoutPath, 'PATCH', { ...changedWorkout, confirmPlanChange: true })).status, 409);
  assert.equal((await call('/api/workouts' + scope, 'POST', { ...saved.data.workout, date: '2027-12-01', version: 1 })).status, 409);
  assert.equal((await call('/api/workouts' + scope, 'POST', { ...saved.data.workout, date: '2027-12-01', version: 1, confirmPlanChange: true })).status, 201);
  const restPath = path + '/rest-days/' + encodeURIComponent(data.restDays[0].id);
  assert.equal((await call(restPath, 'DELETE', { version: 1 })).status, 409);
  assert.equal((await call(restPath, 'DELETE', { version: 1, confirmPlanChange: true })).status, 200);
  assert.equal((await call('/api/training' + scope, 'PATCH', { raceName: 'Updated goal', raceDate: setup.goal.targetDate, version: (await call('/api/training' + scope)).data.plan.version })).status, 409);
  const backup = (await call('/api/export' + scope)).data;
  assert.equal(backup.schemaVersion, 6);
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  await testRestore(backup);
  assert.deepEqual((await call('/api/training')).data.plan, original.plan);
  assert.equal((await call('/api/blocks/' + encodeURIComponent(original.plan.id), 'PATCH', { status: 'completed', version: original.plan.version })).status, 200);
  data = (await call('/api/training' + scope)).data;
  assert.equal((await call(path, 'PATCH', { status: 'active', version: data.plan.version })).status, 200);
  console.log('PASS: mocked OpenAI generation, ownership, concurrency/cooldown, review-only drafts, atomic/idempotent acceptance, logging vs altered prescriptions, activation and v5 restore.');

  // Provider failures and clarifications never create schedule rows.
  await cool();
  let failure = await create();
  pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(429, 'sensitive upstream body');
  let result = await call('/api/blocks/' + failure.id + '/generation', 'POST', { version: failure.version, consent: true });
  assert.equal(result.status, 429);
  assert.equal(result.data.block.generation.status, 'failed');
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  assert.equal((await call('/api/training?blockId=' + failure.id)).data.workouts.length, 0);
  await cool();
  failure = result.data.block;
  pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(200, responseFixture({ ...output, sessions: [] }));
  result = await call('/api/blocks/' + failure.id + '/generation', 'POST', { version: failure.version, consent: true });
  assert.equal(result.data.block.generation.status, 'failed');
  assert.equal(result.data.block.generation.validationFailure, 'schedule_completeness');
  assert.deepEqual(result.data.block.generation.usage, { inputTokens: 1000, outputTokens: 2000 });
  assert.doesNotMatch(result.data.error, /goal is too ambitious/);
  assert.doesNotMatch(result.data.error, /Review your inputs/);
  const failureReload = (await call('/api/training?blockId=' + failure.id)).data;
  assert.equal(failureReload.plan.generation.validationFailure, 'schedule_completeness');
  assert.equal(failureReload.workouts.length, 0); assert.equal(failureReload.restDays.length, 0);
  const failureBackup = (await call('/api/export?blockId=' + failure.id)).data;
  assert.deepEqual(normalizeTrainingBackup(failureBackup), failureBackup);
  const failurePage = await dispatch('http://localhost/blocks/' + failure.id + '/setup', { headers: auth });
  const failureHtml = await failurePage.text();
  assert.match(failureHtml, /Plan generation couldn’t finish/);
  assert.match(failureHtml, /wrong number of workouts/);
  assert.doesNotMatch(failureHtml, /Check these details/);
  await cool();
  failure = result.data.block;
  const clarification = { ...output, outcome: 'needs_clarification', sessions: [], questions: ['Would you prefer to review your target finish time or race date?'], assessment: { decision: 'adjust_goal', reason: 'The synthetic assessment asks for a more supportable goal.', actions: ['target_time','race_date'] } };
  clarification.assessment.suggestions = {
    finishTime: { durationSeconds: 2100, reason: 'Closer to the example benchmark.' },
    schedule: { additionalDays: 14, trainingDays: null, reason: 'An example extension.' },
  };
  pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(200, responseFixture(clarification));
  result = await call('/api/blocks/' + failure.id + '/generation', 'POST', { version: failure.version, consent: true, saveImmediately: true });
  assert.equal(result.status, 200);
  assert.equal(result.data.block.generation.status, 'clarification');
  assert.deepEqual(result.data.block.setup, setup);
  assert.deepEqual(result.data.block.generation.output.assessment.actions, ['target_time', 'race_date']);
  const blockedData = (await call('/api/training?blockId=' + failure.id)).data;
  assert.deepEqual(blockedData.plan.generation.output.assessment.suggestions, clarification.assessment.suggestions);
  assert.equal(blockedData.workouts.length, 0); assert.equal(blockedData.restDays.length, 0);
  assert.equal(result.data.block.generation.usage.outputTokens, 2000);
  const adjustmentPage = await dispatch('http://localhost/blocks/' + failure.id + '/setup?edit=target_time', { headers: auth });
  const adjustmentHtml = await adjustmentPage.text();
  assert.match(adjustmentHtml, /Let’s adjust the plan inputs/);
  assert.match(adjustmentHtml, /Edit target finish time/);
  assert.match(adjustmentHtml, /Edit race date/);
  assert.match(adjustmentHtml, /No workouts were created/);
  assert.match(adjustmentHtml, /id="setup-targetTime"/);
  assert.ok(!adjustmentHtml.includes('Edit running experience'));
  const benchmarkPage = await dispatch('http://localhost/blocks/' + failure.id + '/setup?edit=benchmark', { headers: auth });
  assert.match(await benchmarkPage.text(), /id="setup-benchmarkDistance"/);
  assert.equal((await call('/api/blocks/' + failure.id + '/generation/accept', 'POST', { version: result.data.block.version, generationId: result.data.block.generation.id })).status, 409);
  const changed = await call('/api/blocks/' + failure.id + '/setup', 'PUT', { setup, version: result.data.block.version });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.block.generation, null);
  console.log('PASS: provider failures, invalid output, clarification and intake edits preserve schedules and invalidate stale drafts.');
  // Fail a late insert after earlier workout inserts have executed. The whole
  // acceptance batch must roll back, including its reservation/version update.
  await cool();
  const rollbackDraft = await create();
  pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(200, responseFixture(output));
  const proposal = await call('/api/blocks/' + rollbackDraft.id + '/generation', 'POST', { version: rollbackDraft.version, consent: true });
  assert.equal(proposal.status, 200);
  const review = proposal.data.block;
  await db.prepare(`CREATE TRIGGER test_planner_acceptance_failure BEFORE INSERT ON workouts
    WHEN NEW.type = 'Race' AND NEW.plan_id = '${rollbackDraft.id}'
    BEGIN SELECT RAISE(ABORT, 'synthetic acceptance failure'); END`).run();
  try {
    const failedAcceptance = await call('/api/blocks/' + rollbackDraft.id + '/generation/accept', 'POST', { version: review.version, generationId: review.generation.id });
    assert.equal(failedAcceptance.status, 500);
    const afterFailure = (await call('/api/training?blockId=' + rollbackDraft.id)).data;
    assert.equal(afterFailure.workouts.length, 0);
    assert.equal(afterFailure.restDays.length, 0);
    assert.deepEqual(afterFailure.plan, review);
  } finally { await db.prepare('DROP TRIGGER test_planner_acceptance_failure').run(); }
  assert.equal((await call('/api/blocks/' + rollbackDraft.id + '/generation/accept', 'POST', { version: review.version, generationId: review.generation.id })).status, 200);
  console.log('PASS: a simulated storage failure rolls back all workouts, rest days, acceptance metadata and versions; retry saves the complete schedule.');
  mock.assertNoPendingInterceptors();
}

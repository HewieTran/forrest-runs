import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { centralToday } from '../lib/domain.ts';
import { GOAL_REVIEW_VERSION } from '../lib/goal-review.ts';
import { preparePlanner } from '../lib/planner.ts';
import { GENERATION_COOLDOWN_MS, MONTHLY_BUDGET_MICRODOLLARS, REQUEST_RESERVE_MICRODOLLARS } from '../lib/planner-policy.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { Miniflare, applyAllMigrations, createFetchMock } from './d1-helpers.mjs';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';

const owner = 'goal-review-owner';
const other = 'goal-review-other';
const invalidatedOwner = 'goal-review-invalidated';
const today = centralToday();
const adjustment = {
  decision: 'adjust', reason: 'Synthetic conflict in the selected plan inputs.', approach: 'Try the one available change.',
  options: [{ kind: 'target_time', reason: 'Synthetic alternative time.', targetDurationSeconds: 1920, additionalDays: null, trainingDays: null }],
};

function assessmentResponse(output) {
  return {
    id: 'resp_assessment_test', model: 'gpt-6-luna', status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    usage: { input_tokens: 1000, output_tokens: 1000 },
  };
}

export async function testGoalReview(db, dispatch, mock) {
  const pool = mock.get('https://api.openai.com');
  const requests = [];
  function intercept(name, output, hold) {
    pool.intercept({ path: '/v1/responses', method: 'POST' }).reply(200, async ({ body }) => {
      const request = JSON.parse(await new Response(body).text());
      requests.push(JSON.parse(request.input));
      if (request.text.format.name !== name) return { status: 'wrong synthetic response schema' };
      if (hold) await hold();
      return output;
    });
  }
  const requestAssessment = (output = adjustment) => intercept('running_goal_review_v1', assessmentResponse(output));
  function requestPlan(setup, raceOffset = 0) {
    const input = preparePlanner(setup, today);
    const output = { ...simulatedPlan(input).output, assessment: { decision: 'proceed', reason: 'Synthetic confirmed plan.', actions: [], suggestions: null } };
    output.sessions.at(-1).steps.find(step => step.kind === 'race').durationSeconds += raceOffset;
    intercept('running_race_plan_v12_confirmed_goal', responseFixture(output));
  }
  async function call(user, route, method = 'GET', body) {
    const response = await dispatch('http://localhost' + route, {
      method, headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': user, 'oai-authenticated-user-email': user + '@example.test' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function status(pending, expected) {
    const result = await pending;
    assert.equal(result.status, expected, JSON.stringify(result.data).slice(0, 1000));
    return result.data;
  }
  async function create(user, setup = currentPlannerFixture(today).setup) {
    return (await status(call(user, '/api/blocks', 'POST', { setup, complete: true }), 201)).block;
  }
  const route = id => '/api/blocks/' + encodeURIComponent(id);
  const assess = (user, block) => call(user, route(block.id) + '/goal-review', 'POST', { version: block.version, consent: true });
  const generate = (user, block, goalReview) => call(user, route(block.id) + '/generation', 'POST', {
    version: block.version, consent: true, saveImmediately: true, ...(goalReview ? { goalReview } : {}),
  });
  const read = (user, block) => status(call(user, '/api/training?blockId=' + encodeURIComponent(block.id)), 200);
  const usage = block => db.prepare('SELECT id, request_type, status, outcome, charged_microdollars FROM training_ai_usage WHERE block_id=? ORDER BY started_at, id').bind(block.id).all().then(data => data.results);
  const confirmedSelection = block => ({ reviewId: block.goalReview.id, option: 'target_time' });

  const created = await create(owner);
  await status(assess(other, created), 404);
  await status(generate(other, created), 404);
  await status(generate(owner, created), 409);
  assert.equal(requests.length, 0);
  assert.equal((await usage(created)).length, 0);

  requestAssessment();
  const first = await Promise.all([assess(owner, created), assess(owner, created)]);
  assert.deepEqual(first.map(result => result.status).sort(), [200, 409], JSON.stringify(first.map(result => [result.data.error, result.data.errorCode, requests.length])));
  let reviewed = first.find(result => result.status === 200).data.block;
  const { goalReview } = reviewed;
  assert.equal(goalReview.status, 'ready');
  assert.equal(goalReview.promptVersion, GOAL_REVIEW_VERSION);
  assert.deepEqual(goalReview.output, adjustment);
  assert.deepEqual(reviewed.setup, created.setup);
  assert.deepEqual(requests[0].intake, goalReview.input);
  assert.equal(requests[0].schedule, undefined);
  assert.equal(requests.length, 1);
  assert.deepEqual((await read(owner, created)).plan.goalReview, goalReview);
  assert.deepEqual((await status(assess(owner, reviewed), 200)).block.goalReview, goalReview);
  assert.equal(requests.length, 1);
  reviewed = (await status(call(owner, route(created.id) + '/setup', 'PUT', {
    setup: { ...reviewed.setup, step: 2 }, version: reviewed.version, complete: false,
  }), 200)).block;
  assert.deepEqual(reviewed.goalReview, goalReview);
  assert.deepEqual((await status(assess(owner, reviewed), 200)).block.goalReview, goalReview);
  assert.equal(requests.length, 1);

  const selected = confirmedSelection(reviewed);
  await status(generate(owner, reviewed), 409);
  await status(generate(owner, reviewed, { reviewId: goalReview.id, option: null }), 409);
  await status(generate(owner, reviewed, { ...selected, reviewId: 'not-the-saved-review' }), 409);
  await status(generate(owner, reviewed, { ...selected, option: 'race_date' }), 409);
  await status(generate(owner, reviewed, { ...selected, targetDurationSeconds: 1234 }), 400);
  await status(generate(owner, reviewed, { ...selected, trainingDays: [1, 3, 6] }), 409);
  await status(generate(other, reviewed, selected), 404);
  assert.equal((await usage(created)).length, 1);
  const before = await read(owner, created);
  assert.equal(before.workouts.length, 0);
  assert.equal(before.plan.version, reviewed.version);
  assert.equal(before.plan.generation, null);
  assert.equal(before.plan.goalReview.confirmation, undefined);

  // Stage two can run immediately, and invalid output does not undo confirmation.
  const confirmedSetup = { ...reviewed.setup, goal: { ...reviewed.setup.goal, targetDurationSeconds: 1920 } };
  requestPlan(confirmedSetup, 1);
  const rejected = await status(generate(owner, reviewed, selected), 502);
  const failed = rejected.block;
  assert.equal(failed.generation.validationFailure, 'goal_target');
  assert.deepEqual(failed.goalReview.confirmation.selection, selected);
  assert.deepEqual(failed.setup, confirmedSetup);
  assert.deepEqual(failed.goalReview.setupSnapshot, created.setup);
  assert.deepEqual(failed.goalReview.confirmation.setup, confirmedSetup);
  assert.equal((await read(owner, created)).workouts.length, 0);
  assert.equal(requests[1].intake.goal.targetDurationSeconds, 1920);
  assert.deepEqual(requests[1].intake.baseline, requests[0].intake.baseline);
  assert.deepEqual(requests[1].confirmedReview, adjustment);
  const rejectedCharges = await usage(created);
  assert.deepEqual(rejectedCharges.map(row => row.request_type).sort(), ['assessment', 'plan']);
  assert.equal(rejectedCharges.find(row => row.id === goalReview.id).outcome, 'adjust');
  assert.equal(rejectedCharges.find(row => row.id === failed.generation.id).outcome, 'invalid');
  assert.ok(rejectedCharges.every(row => row.status === 'settled' && row.charged_microdollars > 0));

  await status(generate(owner, failed, selected), 409);
  await status(generate(owner, failed, { ...selected, option: 'race_date' }), 409);
  assert.equal(requests.length, 2);
  // Exceed the cooldown without delaying the test or changing review state.
  const past = new Date(Date.now() - 190000).toISOString();
  await db.prepare('UPDATE training_ai_usage SET started_at=? WHERE id=?').bind(past, failed.generation.id).run();
  await db.prepare("UPDATE training_plans SET generation=json_set(generation,'$.startedAt',?) WHERE id=?").bind(past, created.id).run();
  requestPlan(confirmedSetup);
  const racers = await Promise.all([generate(owner, failed, selected), generate(owner, failed, selected)]);
  assert.ok(racers.some(result => result.status === 200), JSON.stringify(racers).slice(0, 1200));
  assert.ok(racers.every(result => [200, 409].includes(result.status)));
  const saved = await read(owner, created);
  assert.equal(saved.plan.generation.status, 'accepted');
  assert.deepEqual(saved.plan.setup, confirmedSetup);
  assert.equal(saved.workouts.find(workout => workout.type === 'Race').plannedDurationSeconds, 1920);
  assert.equal(requests.length, 3);
  assert.equal((await usage(created)).length, 3);
  await status(generate(owner, failed, selected), 200);
  assert.equal(requests.length, 3);
  const backup = await status(call(owner, '/api/export?blockId=' + encodeURIComponent(created.id)), 200);
  assert.equal(backup.schemaVersion, 10);
  assert.deepEqual(normalizeTrainingBackup(backup).blocks[0].goalReview, saved.plan.goalReview);

  const editable = await create(invalidatedOwner);
  requestAssessment();
  const editableReview = (await status(assess(invalidatedOwner, editable), 200)).block;
  const editedSetup = { ...editableReview.setup, benchmark: { ...editableReview.setup.benchmark, durationSeconds: null, effortConfirmed: false } };
  const edited = (await status(call(invalidatedOwner, route(editable.id) + '/setup', 'PUT', {
    setup: editedSetup, version: editableReview.version, complete: false,
  }), 200)).block;
  assert.equal(edited.goalReview, null);
  assert.equal((await read(invalidatedOwner, editable)).plan.goalReview, null);
  await status(generate(invalidatedOwner, edited, confirmedSelection(editableReview)), 409);
  assert.equal((await usage(editable)).length, 1);

  async function reviseTarget(user, block, targetDurationSeconds) {
    const setup = { ...block.setup, goal: { ...block.setup.goal, targetDurationSeconds } };
    return (await status(call(user, route(block.id) + '/setup', 'PUT', {
      setup, version: block.version, complete: true,
    }), 200)).block;
  }

  // A successful unsupported assessment consumes its budget, but does not make
  // a changed goal wait a minute. Reopening the same review makes no request.
  const revisedOwner = 'goal-review-revised';
  const ambitiousSetup = currentPlannerFixture(today).setup;
  ambitiousSetup.goal.targetDurationSeconds = 900;
  const ambitious = await create(revisedOwner, ambitiousSetup);
  const unsupported = {
    decision: 'unsupported', reason: 'Synthetic unsupported target.',
    approach: 'Edit the finish time and review the revised goal.', options: [],
  };
  requestAssessment(unsupported);
  const unsupportedBlock = (await status(assess(revisedOwner, ambitious), 200)).block;
  assert.equal(unsupportedBlock.goalReview.output.decision, 'unsupported');
  assert.deepEqual((await status(assess(revisedOwner, unsupportedBlock), 200)).block.goalReview, unsupportedBlock.goalReview);
  assert.equal((await usage(ambitious)).length, 1);

  const revised = await reviseTarget(revisedOwner, unsupportedBlock, 1800);
  assert.equal(revised.goalReview, null);
  requestAssessment({ decision: 'proceed', reason: 'Synthetic revised target accepted.', approach: 'Generate after confirmation.', options: [] });
  const renewed = (await status(assess(revisedOwner, revised), 200)).block;
  assert.equal(renewed.goalReview.output.decision, 'proceed');
  assert.equal(renewed.goalReview.input.goal.targetDurationSeconds, 1800);
  assert.deepEqual(renewed.setup.benchmark, ambitious.setup.benchmark);
  assert.notEqual(renewed.goalReview.id, unsupportedBlock.goalReview.id);
  assert.ok(Date.parse(renewed.goalReview.startedAt) - Date.parse(unsupportedBlock.goalReview.startedAt) < GENERATION_COOLDOWN_MS);
  assert.deepEqual((await status(assess(revisedOwner, renewed), 200)).block.goalReview, renewed.goalReview);
  const revisedCharges = await usage(ambitious);
  assert.equal(revisedCharges.length, 2);
  assert.ok(revisedCharges.every(row => row.request_type === 'assessment' && row.status === 'settled'));
  assert.deepEqual(revisedCharges.map(row => row.outcome).sort(), ['proceed', 'unsupported']);

  // Failed or billing-uncertain reviews still throttle retries after input edits
  // even though the edit clears the visible review from the draft.
  for (const [failure, response, expectedStatus] of [
    ['invalid', assessmentResponse({ ...unsupported, options: null }), 'settled'],
    ['uncertain', 'unreadable synthetic provider response', 'uncertain'],
  ]) {
    const failureOwner = 'goal-review-' + failure;
    const failedDraft = await create(failureOwner);
    intercept('running_goal_review_v1', response);
    const failedReview = (await status(assess(failureOwner, failedDraft), 502)).block;
    assert.equal(failedReview.goalReview.status, 'failed');
    const changedDraft = await reviseTarget(failureOwner, failedReview, 1860);
    assert.equal(changedDraft.goalReview, null);
    const callsBefore = requests.length;
    await status(assess(failureOwner, changedDraft), 409);
    assert.equal(requests.length, callsBefore);
    assert.deepEqual((await usage(failedDraft)).map(row => row.status), [expectedStatus]);
  }

  // A live assessment holds the account lease across both request types.
  const leaseOwner = 'goal-review-lease';
  const pendingBlock = await create(leaseOwner);
  const reviewedBlock = await create(leaseOwner);
  requestAssessment();
  const priorReview = (await status(assess(leaseOwner, reviewedBlock), 200)).block;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  intercept('running_goal_review_v1', assessmentResponse(adjustment), () => {
    started.resolve();
    return release.promise;
  });
  const inProgress = assess(leaseOwner, pendingBlock);
  try {
    const timeout = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Synthetic assessment did not reserve the account lease.')), 5000);
      timer.unref();
    });
    await Promise.race([started.promise, inProgress.then(result => { throw new Error(JSON.stringify(result).slice(0, 500)); }), timeout]);
    await status(generate(leaseOwner, priorReview, confirmedSelection(priorReview)), 409);
    assert.equal((await usage(reviewedBlock)).length, 1);
  } finally {
    release.resolve();
    await inProgress;
  }
  await status(inProgress, 200);
  requestPlan(confirmedSetup);
  await status(generate(leaseOwner, priorReview, confirmedSelection(priorReview)), 200);

  // One shared cap may admit assessment but deny the plan without saving confirmation.
  const capOwner = 'goal-review-budget';
  const capped = await create(capOwner);
  const period = new Date().toISOString().slice(0, 7);
  const used = (await db.prepare('SELECT sum(charged_microdollars) AS total FROM training_ai_usage').first()).total;
  await db.prepare("INSERT INTO training_ai_usage (id,owner_id,block_id,period,started_at,model,pricing_version,status,reserved_microdollars,charged_microdollars,request_type) VALUES ('near-cap','old-owner','gone-block',?,?,'gpt-6-luna','test','settled',?,?,'plan')")
    .bind(period, past, REQUEST_RESERVE_MICRODOLLARS, MONTHLY_BUDGET_MICRODOLLARS - REQUEST_RESERVE_MICRODOLLARS - used).run();
  requestAssessment();
  const cappedReview = (await status(assess(capOwner, capped), 200)).block;
  const denied = await status(generate(capOwner, cappedReview, confirmedSelection(cappedReview)), 429);
  assert.equal(denied.errorCode, 'budget');
  const capState = await read(capOwner, capped);
  assert.deepEqual(capState.plan.setup, capped.setup);
  assert.deepEqual(capState.plan.goalReview, cappedReview.goalReview);
  assert.equal(capState.plan.generation, null);
  assert.equal((await usage(capped)).length, 1);
  assert.equal(requests.length, 12);
  mock.assertNoPendingInterceptors();
  console.log('PASS: goal review isolation, cached review, required saved selection, exact race target, version conflicts, stage cooldowns, retries, setup invalidation, immediate reassessment after success, failed-review cooldown and shared budget.');
}

if (import.meta.main) {
  const files = await readdir('dist/server', { recursive: true });
  const modules = ['index.js', ...files.filter(file => file.endsWith('.js') && file !== 'index.js')]
    .map(file => ({ type: 'ESModule', path: path.resolve('dist/server', file) }));
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  const worker = new Miniflare({ modules, fetchMock, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], cf: false,
    d1Databases: { DB: 'goal-review-tests-only' },
    bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-luna' } });
  try {
    const db = await worker.getD1Database('DB');
    await applyAllMigrations(db);
    await testGoalReview(db, (input, init) => worker.dispatchFetch(input, init), fetchMock);
  } finally { await worker.dispose(); }
}

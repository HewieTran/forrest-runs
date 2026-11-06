import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentContext } from '../lib/plan-assessment.ts';
import { validatePlanOutput, validateGeneration, PROMPT_VERSION, PLANNER_VERSION } from '../lib/planner.ts';
import { requestOpenAIPlan } from '../lib/openai-plan.ts';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';
import { addDays } from '../lib/domain.ts';
const today = '2026-10-31';
const config = { apiKey: 'synthetic-key', model: 'gpt-6-luna', asOfDate: today };
const fixture = currentPlannerFixture(today);
function blocked(decision = 'adjust_goal', actions = ['target_time', 'race_date']) {
  return { ...fixture.output, outcome: 'needs_clarification', sessions: [], questions: ['Would you review the target time or race date?'],
    assessment: { decision, reason: 'Synthetic goal needs adjustment; no performance prediction is made.', actions } };
}

test('benchmark ages use calendar dates at generation and training start without a fixed expiry', () => {
  const input = structuredClone(fixture.input);
  input.goal.startDate = '2026-11-14'; input.goal.raceDate = '2026-12-12';
  input.baseline.results[0].date = '2026-01-01';
  assert.deepEqual(assessmentContext(input, today), { asOfDate: today, benchmarkAgeDays: 303, benchmarkAgeAtStartDays: 317, trainingWindowDays: 28 });
  input.baseline.results[0].date = addDays(today, 1);
  assert.throws(() => assessmentContext(input, today));
});

test('assessment decisions cannot authorize a contradictory schedule or unsupported edit action', () => {
  assert.doesNotThrow(() => validatePlanOutput(fixture.output, fixture.input, true));
  assert.doesNotThrow(() => validatePlanOutput(blocked(), fixture.input, true));
  assert.doesNotThrow(() => validatePlanOutput(blocked('refresh_benchmark', ['benchmark']), fixture.input, true));
  for (const output of [
    { ...fixture.output, assessment: undefined },
    { ...fixture.output, assessment: blocked().assessment },
    { ...blocked(), sessions: fixture.output.sessions },
    { ...blocked(), questions: [] },
    blocked('proceed', []), blocked('adjust_goal', ['benchmark']),
    blocked('refresh_benchmark', ['race_date']), blocked('clarify', []),
    blocked('adjust_goal', ['experience']), blocked('adjust_goal', ['target_time', 'target_time']),
  ]) assert.throws(() => validatePlanOutput(output, fixture.input, true));
});

test('current provider output must include assessment; invalid output still reports billed usage once', async () => {
  let calls = 0;
  const { assessment, ...oldOutput } = fixture.output;
  await assert.rejects(requestOpenAIPlan(fixture.input, config, async () => { calls++; return Response.json(responseFixture(oldOutput)); }),
    error => error.code === 'invalid' && error.usage.inputTokens === 1000 && error.usage.outputTokens === 2000);
  assert.equal(calls, 1);
});

test('unsupported goal and unrepresentative benchmark return no schedule and preserve requested inputs', async () => {
  const input = structuredClone(fixture.input);
  input.runner.experience = 'novice'; input.goal.targetDurationSeconds = 900;
  const before = structuredClone(input);
  for (const output of [blocked(), blocked('refresh_benchmark', ['benchmark'])]) {
    let request;
    const result = await requestOpenAIPlan(input, config, async (_url, init) => {
      request = JSON.parse(JSON.parse(init.body).input);
      return Response.json(responseFixture(output));
    });
    assert.deepEqual(request.intake, before);
    assert.deepEqual(input, before);
    assert.equal(result.output.sessions.length, 0);
    assert.deepEqual(result.assessmentContext, assessmentContext(input, today));
    assert.equal(request.planningContext.benchmarkAgeDays, 7);
    assert.deepEqual(request.planningContext, result.assessmentContext);
  }
});

test('saved generation validates assessment context and retains it in offline backup validation', () => {
  const stamp = today + 'T12:00:00.000Z';
  const generation = { schemaVersion: 1, id: 'assessment-test', provider: 'openai', status: 'clarification', startedAt: stamp, finishedAt: stamp,
    acceptedAt: null, alteredAt: null, model: config.model, promptVersion: PROMPT_VERSION, validatorVersion: PLANNER_VERSION,
    input: fixture.input, setupSnapshot: fixture.setup, output: blocked(), error: null, responseId: null,
    usage: { inputTokens: 1000, outputTokens: 2000 }, assessmentContext: assessmentContext(fixture.input, today) };
  assert.deepEqual(validateGeneration(generation), generation);
  assert.throws(() => validateGeneration({ ...generation, assessmentContext: { ...generation.assessmentContext, benchmarkAgeDays: 999 } }));
  assert.throws(() => validateGeneration({ ...generation, output: { ...blocked(), assessment: undefined } }));
});

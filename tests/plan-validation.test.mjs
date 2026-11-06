import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanOutput, validateGeneration, PROMPT_VERSION, PLANNER_VERSION } from '../lib/planner.ts';
import { requestOpenAIPlan, PlanProviderError } from '../lib/openai-plan.ts';
import { displayGenerationError, LEGACY_VALIDATION_MESSAGE } from '../lib/plan-validation.ts';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';
const today = '2026-10-31';
const { setup, input, output } = currentPlannerFixture(today);

test('validation diagnostics distinguish generated arithmetic, dates, completeness and assessment errors', () => {
  const cases = [
    [o => o.sessions.pop(), 'schedule_completeness'],
    [o => { o.sessions[1].date = o.sessions[0].date; }, 'schedule_dates'],
    [o => { o.sessions[0].steps[0].durationSeconds += 300; }, 'workout_arithmetic'],
    [o => { o.sessions[0].steps[0].distanceMiles = null; }, 'numeric_targets'],
    [o => { o.sessions[0].type = 'Quality Run'; }, 'warmup_cooldown'],
    [o => { o.sessions[0].steps[0].durationSeconds = 'private invalid value'; }, 'output_shape'],
    [o => { delete o.assessment; }, 'assessment'],
  ];
  for (const [edit, expected] of cases) {
    const changed = structuredClone(output); edit(changed);
    assert.throws(() => validatePlanOutput(changed, input, true), error => error.code === expected && !error.message.includes('private invalid value'));
  }
});

test('provider retains a safe validation reason and paid usage with no retry or fitness conclusion', async () => {
  const changed = structuredClone(output); changed.sessions.pop();
  let calls = 0;
  await assert.rejects(requestOpenAIPlan(input, { apiKey: 'synthetic', model: 'gpt-6-luna', asOfDate: today }, async () => {
    calls++; return Response.json(responseFixture(changed));
  }), error => error instanceof PlanProviderError && error.code === 'invalid' && error.validationFailure === 'schedule_completeness'
    && error.usage.outputTokens === 2000 && error.message.includes('wrong number of workouts')
    && !error.message.includes('goal is too ambitious')
    && error.message.includes('retry with the same inputs') && !error.message.includes('Review your inputs'));
  assert.equal(calls, 1);
});

test('unreadable responses have a format diagnostic and never echo provider text', async () => {
  await assert.rejects(requestOpenAIPlan(input, { apiKey: 'synthetic', model: 'gpt-6-luna', asOfDate: today }, async () => new Response('private provider text')),
    error => error.validationFailure === 'response_format' && !error.message.includes('private provider text'));
});

test('old generic failures display the clarified message without rewriting historical records', () => {
  assert.match(displayGenerationError(LEGACY_VALIDATION_MESSAGE), /couldn’t validate a complete/);
  assert.doesNotMatch(displayGenerationError(LEGACY_VALIDATION_MESSAGE), /goal is too ambitious/);
  assert.equal(displayGenerationError('An unrelated error.'), 'An unrelated error.');
  const stamp = today + 'T12:00:00.000Z';
  const saved = { schemaVersion: 1, id: 'validation-test', provider: 'openai', status: 'failed', startedAt: stamp, finishedAt: stamp,
    acceptedAt: null, alteredAt: null, model: 'gpt-6-luna', promptVersion: PROMPT_VERSION, validatorVersion: PLANNER_VERSION,
    input, setupSnapshot: setup, output: null, error: LEGACY_VALIDATION_MESSAGE, responseId: null, usage: null };
  assert.deepEqual(validateGeneration(saved), saved);
  const diagnostic = { ...saved, validationFailure: 'workout_arithmetic', usage: { inputTokens: 1000, outputTokens: 2000 } };
  assert.deepEqual(validateGeneration(diagnostic), diagnostic);
  assert.throws(() => validateGeneration({ ...saved, validationFailure: 'arbitrary provider text' }));
});

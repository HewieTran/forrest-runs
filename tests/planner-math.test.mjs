import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlanMeasurements, verifyCalculatedMeasurements, FIVE_K_MILES, PLAN_CALCULATION_VERSION } from '../lib/planner-math.ts';
import { validatePlanOutput, validateGeneration, PROMPT_VERSION, PLANNER_VERSION } from '../lib/planner.ts';
import { requestOpenAIPlan, PLAN_JSON_SCHEMA } from '../lib/openai-plan.ts';
import { currentPlannerFixture, providerOutput, responseFixture } from './planner-fixture.mjs';
const today = '2026-10-31', { setup, input, output } = currentPlannerFixture(today);
const config = { apiKey: 'synthetic', model: 'gpt-6-luna', asOfDate: today };
function calculate(wire) { return validatePlanOutput(calculatePlanMeasurements(wire, input), input, true); }

test('duration and pace produce distance; estimated race duration and fixed 5K produce race pace', () => {
  const wire = providerOutput(output);
  wire.sessions[0].steps[0].durationSeconds = 1200; wire.sessions[0].steps[0].paceSecondsPerMile = 600;
  wire.sessions.at(-1).steps[0].durationSeconds = 1801;
  const result = calculate(wire);
  assert.equal(result.sessions[0].steps[0].distanceMiles, 2);
  const race = result.sessions.at(-1).steps[0];
  assert.equal(race.distanceMiles, FIVE_K_MILES); assert.equal(race.paceSecondsPerMile, 1801 / FIVE_K_MILES);
  assert.equal(race.durationSeconds, 1801); assert.equal(input.goal.targetDurationSeconds, 1800);
  assert.doesNotThrow(() => verifyCalculatedMeasurements(result, input));
});

test('fractional paces and durations retain full precision before display rounding', () => {
  for (const seconds of [1, 59, 601, 1201, 3601]) for (const pace of [300.125, 777.777, 1200.5]) {
    const wire = providerOutput(output); const step = wire.sessions[0].steps[0];
    step.durationSeconds = seconds; step.paceSecondsPerMile = pace;
    const result = calculate(wire).sessions[0].steps[0];
    assert.equal(result.durationSeconds, seconds); assert.equal(result.paceSecondsPerMile, pace);
    assert.equal(result.distanceMiles, seconds / pace);
    assert.ok(Math.abs(result.distanceMiles * pace - seconds) < 1e-9);
  }
});

test('new wire rejects a third model number, model race pace and invalid pairs instead of choosing conflicting values', () => {
  for (const edit of [
    w => { w.sessions[0].steps[0].distanceMiles = 99; },
    w => { w.sessions.at(-1).steps[0].paceSecondsPerMile = 600; },
    w => { w.sessions[0].steps[0].paceSecondsPerMile = 0; },
    w => { w.sessions[0].steps[0].durationSeconds = 0; },
    w => { w.sessions[0].steps[0].paceSecondsPerMile = Infinity; },
  ]) { const wire = providerOutput(output); edit(wire); assert.throws(() => calculate(wire)); }
  const missing = providerOutput(output); missing.sessions[0].steps[0].paceSecondsPerMile = null;
  assert.throws(() => calculate(missing), error => error.code === 'numeric_targets');
});

test('calculating numbers does not relax date, completeness or warmup/cooldown checks', () => {
  for (const [edit, code] of [
    [w => w.sessions.pop(), 'schedule_completeness'],
    [w => { w.sessions[1].date = w.sessions[0].date; }, 'schedule_dates'],
    [w => { w.sessions[0].type = 'Quality Run'; }, 'warmup_cooldown'],
  ]) { const wire = providerOutput(output); edit(wire); assert.throws(() => calculate(wire), error => error.code === code); }
});

test('new snapshots verify calculated provenance while historical three-number snapshots stay unchanged', () => {
  const stamp = today + 'T12:00:00.000Z', canonical = calculate(providerOutput(output));
  const generation = { schemaVersion: 1, id: 'math-snapshot', provider: 'openai', status: 'accepted', startedAt: stamp, finishedAt: stamp,
    acceptedAt: stamp, alteredAt: null, model: 'gpt-6-luna', promptVersion: PROMPT_VERSION, validatorVersion: PLANNER_VERSION,
    calculationVersion: PLAN_CALCULATION_VERSION, input, setupSnapshot: setup, output: canonical, error: null, responseId: null, usage: null };
  assert.deepEqual(validateGeneration(generation), generation);
  const tampered = structuredClone(generation); tampered.output.sessions[0].steps[0].distanceMiles *= 1.001;
  assert.throws(() => validateGeneration(tampered), error => error.code === 'workout_arithmetic');
  const { calculationVersion, ...historical } = tampered; historical.promptVersion = '5k-coach-v5-assessment'; historical.validatorVersion = '5k-v4-assessment';
  assert.deepEqual(validateGeneration(historical), historical); // Existing 1% tolerance; no rewrite.
});

test('provider request omits distance, calculates once, retains usage and never retries', async () => {
  const wireSteps = PLAN_JSON_SCHEMA.properties.sessions.items.properties.steps.items;
  assert.ok(wireSteps.anyOf.every(schema => !('distanceMiles' in schema.properties)));
  assert.deepEqual(wireSteps.anyOf[1].properties.paceSecondsPerMile, { type: 'null' });
  let calls = 0;
  const changed = structuredClone(output); changed.sessions[0].steps[0].durationSeconds += 300;
  const result = await requestOpenAIPlan(input, config, async () => { calls++; return Response.json(responseFixture(changed)); });
  assert.equal(calls, 1); assert.equal(result.calculationVersion, PLAN_CALCULATION_VERSION);
  assert.equal(result.output.sessions[0].steps[0].distanceMiles, changed.sessions[0].steps[0].durationSeconds / changed.sessions[0].steps[0].paceSecondsPerMile);
  assert.equal(result.usage.outputTokens, 2000); assert.equal(result.output.outcome, 'plan');
});

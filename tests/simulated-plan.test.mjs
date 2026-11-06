import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { scheduleDays, sessionSeconds, validateGeneration } from '../lib/planner.ts';
import { plannerFixture } from './planner-fixture.mjs';

test('simulation uses dates and time limits, stays labeled and never reports provider usage', () => {
  const { input } = plannerFixture();
  input.availability.dayDurationLimits['1'] = 900;
  const result = simulatedPlan(input);
  assert.equal(result.output.outcome, 'plan');
  assert.match(result.output.summary, /SIMULATION/);
  assert.equal(result.usage, null);
  assert.equal(result.responseId, null);
  assert.equal(result.model, 'simulated-5k-v1');
  for (const session of result.output.sessions) {
    assert.match(session.title, /SIMULATION/);
    assert.ok(sessionSeconds(session) <= scheduleDays(input).find(day => day.date === session.date).limitSeconds);
    assert.ok(session.steps.every(step => step.paceSecondsPerMile === null));
  }
  assert.deepEqual(simulatedPlan(input), result);
});
test('simulation requests clarification rather than breaking a time constraint for its fixed example race', () => {
  const { input } = plannerFixture();
  input.availability.maxSessionDurationSeconds = 900;
  const result = simulatedPlan(input);
  assert.equal(result.output.outcome, 'needs_clarification');
  assert.equal(result.output.sessions.length, 0);
  assert.ok(result.output.questions.length);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanOutput, scheduleDays, workoutForSession, preparePlanner, changesPrescription, validateGeneration } from '../lib/planner.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { plannerFixture, currentPlannerFixture } from './planner-fixture.mjs';

const { setup, input, output } = plannerFixture();
test('planner schedule covers the full window, exact weekdays and race-day exception', () => {
  assert.deepEqual(validatePlanOutput(output, input), output);
  const days = scheduleDays(input);
  assert.equal(days.length, 29);
  assert.equal(days.at(-1).kind, 'race');
  const altered = structuredClone(input); altered.goal.raceDate = '2026-11-22';
  assert.equal(scheduleDays(altered).at(-1).kind, 'race'); // Sunday not selected
  assert.equal(days.filter(day => day.kind !== 'rest').length, output.sessions.length);
  assert.ok(days.some(day => day.kind === 'rest'));
});
test('invalid scheduling, numeric types, paces and full-session limits fail closed', () => {
  const bad = [];
  let o = structuredClone(output); o.sessions.pop(); bad.push(o);
  o = structuredClone(output); o.sessions[0].date = '2026-10-25'; bad.push(o);
  o = structuredClone(output); o.sessions[1].date = o.sessions[0].date; bad.push(o);
  o = structuredClone(output); o.sessions[0].steps[0].durationSeconds = '1800'; bad.push(o);
  o = structuredClone(output); o.sessions[0].steps[0].durationSeconds = 3601; bad.push(o);
  o = structuredClone(output); o.sessions[0].steps.push({ ...o.sessions[0].steps[0], durationSeconds: 1801 }); bad.push(o);
  o = structuredClone(output); o.sessions[0].steps[0].paceSecondsPerMile = 600; bad.push(o);
  o = structuredClone(output); o.sessions.at(-1).steps[0].distanceMiles = 5; bad.push(o);
  o = structuredClone(output); o.sessions[0].type = 'Quality Run'; bad.push(o);
  for (const value of bad) assert.throws(() => validatePlanOutput(value, input));
  const performance = structuredClone(input); performance.goal.paceGuidance = 'performance';
  o = structuredClone(output); o.sessions[0].steps[0] = { ...o.sessions[0].steps[0], distanceMiles: 3, paceSecondsPerMile: 600 };
  assert.doesNotThrow(() => validatePlanOutput(o, performance));
  o.sessions[0].steps[0].paceSecondsPerMile = 700;
  assert.throws(() => validatePlanOutput(o, performance));
  const override = structuredClone(input); override.availability.dayDurationLimits['6'] = 1700;
  assert.throws(() => validatePlanOutput(output, override));
});
test('race measurement excludes support steps while full-session validation includes them', () => {
  const race = structuredClone(output.sessions.at(-1));
  race.steps.unshift({ kind: 'warmup', label: 'Gentle warmup', durationSeconds: 600, distanceMiles: null, paceSecondsPerMile: null, effort: 'easy' });
  const w = workoutForSession(race);
  assert.equal(w.plannedDurationSeconds, 1800);
  assert.equal(w.plannedDistance, 5000 / 1609.344);
  assert.equal(w.targetMetric, 'distance');
  assert.match(w.plannedWorkout, /Gentle warmup/);
  assert.equal(w.actualDistance, null);
  assert.equal(w.done, false);
});
test('current generation enforces the training window and adult scope', () => {
  const {setup:current}=currentPlannerFixture('2026-10-24');
  for (const edit of [s => { s.goal.startDate = '2026-10-23'; }, s => { s.goal.targetDate = '2026-10-30'; }, s => { s.runner.age = 16; }]) {
    const value = structuredClone(current); edit(value); assert.throws(() => preparePlanner(value, '2026-10-24'));
  }
  assert.equal(input.goal.targetDurationSeconds, null);
  assert.equal(input.runner.age, null);
});
test('clarifications cannot carry a schedule; result logging is not a prescription edit', () => {
  const clarification = { ...output, outcome: 'needs_clarification', sessions: [], questions: ['Can you clarify your other training?'] };
  assert.doesNotThrow(() => validatePlanOutput(clarification, input));
  assert.throws(() => validatePlanOutput({ ...clarification, sessions: output.sessions }, input));
  const before = workoutForSession(output.sessions[0]);
  assert.equal(changesPrescription(before, { ...before, done: true, notes: 'Recorded', actualDistance: 3 }), false);
  assert.equal(changesPrescription(before, { ...before, plannedDurationSeconds: 1900 }), true);
});
test('v5 backups preserve accepted generation provenance and reject damaged snapshots', () => {
  const timestamp = '2026-10-24T12:00:00.000Z';
  const generation = { schemaVersion: 1, id: 'generation-test', status: 'accepted', startedAt: timestamp, finishedAt: timestamp, acceptedAt: timestamp, alteredAt: null, model: 'test-model', promptVersion: '5k-coach-v1', validatorVersion: '5k-v1', input, setupSnapshot: setup, output, error: null, responseId: 'resp_test', usage: { inputTokens: 1000, outputTokens: 2000 } };
  assert.deepEqual(validateGeneration(generation), generation);
  const backup = { schemaVersion: 5, exportedAt: timestamp, blocks: [{ id: 'test', status: 'draft', raceName: 'Example', raceDate: setup.goal.targetDate, setup, generation, paceGuide: [], sourceName: null, version: 4, createdAt: timestamp, updatedAt: timestamp }], workouts: [], restDays: [] };
  assert.deepEqual(normalizeTrainingBackup(backup), { ...backup, schemaVersion: 6 });
  const invalid = structuredClone(backup); invalid.blocks[0].generation.input.baseline.weeklyDistanceMiles = 100;
  assert.throws(() => normalizeTrainingBackup(invalid));
});

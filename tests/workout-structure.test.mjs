import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, EMPTY_WORKOUT_MEASUREMENTS } from '../lib/domain.ts';
import { workoutForSession, changesPrescription } from '../lib/planner.ts';
import { workoutStructure, editWorkoutStep, structureMeasurements, sessionDuration, readableDuration, readableDistance, stepPace, workoutSummary, validateWorkoutStructure } from '../lib/workout-structure.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

const step = (kind, duration, pace, effort = 'easy') => ({ kind, label: kind, durationSeconds: duration, paceSecondsPerMile: pace, distanceMiles: duration / pace, effort });
const session = { date: '2027-04-15', type: 'Quality Run', phase: 'Taper', title: 'Light steady pickups', notes: 'Finish feeling fresh.',
  steps: [step('warmup', 600, 735), step('run', 120, 585, 'steady'), step('recovery', 120, 750), step('run', 120, 585, 'steady'), step('cooldown', 600, 735)] };
function workout() { return { ...EMPTY_WORKOUT_MEASUREMENTS, ...workoutForSession(session), id: 'workout', planId: 'block', originalSource: { generator: 'original', session }, sourceRow: null, updatedAt: '2026-11-04T12:00:00.000Z' }; }

test('display formats seconds and full precision distances into readable units', () => {
  const w = workout();
  assert.equal(readableDuration(600), '10 min');
  assert.equal(readableDuration(90), '1 min 30 sec');
  assert.equal(readableDuration(3665), '1 hr 1 min 5 sec');
  assert.equal(stepPace(session.steps[0], 'mi'), '12:15 /mi');
  assert.equal(stepPace(session.steps[0], 'km'), '7:37 /km');
  assert.equal(readableDistance(w.plannedDistance, 'mi'), '2.20 mi');
  assert.equal(workoutSummary(w), 'Light steady pickups · 26 min · 2.20 mi');
  assert.equal(w.plannedDistance, session.steps.reduce((sum, s) => sum + s.distanceMiles, 0));
});
test('step edits derive new totals without mutating the original session or rounding untouched paces', () => {
  const w = workout(), original = structuredClone(w);
  const structure = editWorkoutStep(w.planStructure, 1, 'duration', 180);
  assert.equal(structure.steps[1].distanceMiles, 180 / 585);
  assert.equal(structureMeasurements(structure).plannedDurationSeconds, 1620);
  const paceEdit = editWorkoutStep(structure, 1, 'pace', 600.125);
  assert.equal(paceEdit.steps[1].distanceMiles, 180 / 600.125);
  assert.equal(structureMeasurements(paceEdit).plannedPaceSecondsPerMile, 1620 / structureMeasurements(paceEdit).plannedDistance);
  assert.deepEqual(w, original);
  assert.equal(changesPrescription(w, { ...w, planStructure: w.planStructure }), false);
  assert.equal(changesPrescription(w, { ...w, planStructure: { ...w.planStructure, notes: 'Different guidance, same totals.' } }), true);
});
test('race totals retain the exact race distance; full-session duration includes warm-up/cool-down', () => {
  const distance = 5000 / 1609.344;
  const structure = { title: 'Race', notes: '', steps: [step('warmup', 600, 735), { ...step('race', 1620, 1620 / distance, 'race'), distanceMiles: distance }, step('cooldown', 600, 735)] };
  assert.equal(sessionDuration(structure), 2820);
  assert.equal(structureMeasurements(structure).plannedDurationSeconds, 1620);
  const changed = editWorkoutStep(structure, 1, 'duration', 1680);
  assert.equal(changed.steps[1].distanceMiles, distance);
  assert.equal(changed.steps[1].paceSecondsPerMile, 1680 / distance);
  assert.equal(structureMeasurements(changed).targetMetric, 'distance');
});
test('unmodified old generated workouts use retained steps; modified/text-only history never gets guessed steps', () => {
  const w = workout(); delete w.planStructure;
  assert.deepEqual(workoutStructure(w), { title: session.title, notes: session.notes, steps: session.steps });
  assert.equal(changesPrescription(w, { ...w, planStructure: workoutStructure(w) }), false);
  assert.equal(changesPrescription({ ...w, planStructure: null }, { ...w, planStructure: null, done: true }), false);
  for (const patch of [{ plannedWorkout: '5 mi steady' }, { plannedDistance: 5 }, { plannedDurationSeconds: 1000 }, { type: 'Strength' }, { originalSource: null }])
    assert.equal(workoutStructure({ ...w, ...patch }), null);
  assert.equal(workoutStructure({ ...w, originalSource: { session: { steps: 'malformed' } } }), null);
});
test('API rejects conflicting totals and invalid steps; step-only input calculates canonical totals', () => {
  const w = workout();
  assert.deepEqual(validateWorkout(w).planStructure, w.planStructure);
  assert.throws(() => validateWorkout({ ...w, plannedDurationSeconds: 1 }), /Edit the workout steps/);
  assert.throws(() => validateWorkout({ ...w, type: 'Strength' }), /workout type/);
  assert.throws(() => validateWorkoutStructure({ ...w.planStructure, steps: [{ ...session.steps[0], durationSeconds: 0 }] }));
  assert.throws(() => validateWorkoutStructure({ ...w.planStructure, steps: [{ ...session.steps[0], distanceMiles: 99 }] }), /inconsistent/);
  const { plannedDistance, plannedDurationSeconds, plannedPaceSecondsPerMile, targetMetric, ...withoutTotals } = w;
  const computed = validateWorkout(withoutTotals);
  assert.deepEqual(structureMeasurements(computed.planStructure), { plannedDistance, plannedDurationSeconds, plannedPaceSecondsPerMile, targetMetric });
  assert.throws(() => validateWorkout({ ...withoutTotals, planStructure: { ...w.planStructure, steps: Array.from({length:12}, () => step('run', 50000, 500)) } }), /distance/);
});
test('backup normalization preserves editable structure and the immutable source independently', () => {
  const w = workout(), structure = editWorkoutStep(w.planStructure, 1, 'duration', 180);
  const edited = { ...w, planStructure: structure, ...structureMeasurements(structure) };
  const backup = { schemaVersion: 6, exportedAt: w.updatedAt, blocks: [{ id: 'block', status: 'draft', raceName: '5K', raceDate: '2027-05-01', paceGuide: [], sourceName: null, version: 1, createdAt: w.updatedAt, updatedAt: w.updatedAt }], workouts: [edited], restDays: [] };
  const normalized = normalizeTrainingBackup(backup);
  assert.deepEqual(normalized.workouts[0].planStructure, structure);
  assert.deepEqual(normalized.workouts[0].originalSource, w.originalSource);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkoutMeasurements, EMPTY_WORKOUT_MEASUREMENTS } from '../lib/workout-targets.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

test('legacy saves omit new fields; explicit null clears them and recorded zero duration is preserved', () => {
  assert.deepEqual(validateWorkoutMeasurements({}), {});
  assert.deepEqual(validateWorkoutMeasurements(EMPTY_WORKOUT_MEASUREMENTS), EMPTY_WORKOUT_MEASUREMENTS);
  assert.deepEqual(validateWorkoutMeasurements({ actualDurationSeconds: 0 }), { actualDurationSeconds: 0 });
  const values = { plannedDistance: 5, plannedDurationSeconds: 3600, actualDurationSeconds: 3599, targetMetric: 'distance' };
  assert.deepEqual(validateWorkoutMeasurements(values), values);
  assert.deepEqual(validateWorkoutMeasurements({ ...values, targetMetric: 'duration' }), { ...values, targetMetric: 'duration' });
});

test('targets require explicit units, whole seconds, one primary metric, and a matching numeric target', () => {
  const valid = { plannedDistance: 5, plannedDurationSeconds: null, targetMetric: 'distance' };
  for (const invalid of [
    { plannedDistance: 5 }, { targetMetric: 'distance' },
    { ...valid, plannedDistance: null }, { ...valid, targetMetric: 'duration' },
    { ...valid, targetMetric: null }, { ...valid, targetMetric: 'pace' },
    ...[-1, 0, 1001, '5', Infinity, NaN].map(plannedDistance => ({ ...valid, plannedDistance })),
    ...[-1, 0, 1.5, '60', 604801].map(plannedDurationSeconds => ({ plannedDistance: null, plannedDurationSeconds, targetMetric: 'duration' })),
    ...[-1, 1.5, '60', 604801, NaN].map(actualDurationSeconds => ({ actualDurationSeconds })),
  ]) assert.throws(() => validateWorkoutMeasurements(invalid));
});

const stamp = '2026-10-23T12:00:00.000Z';
const block = { id: 'block', status: 'active', raceName: 'Winter', raceDate: '2027-02-21', paceGuide: [], sourceName: null, version: 1, createdAt: stamp, updatedAt: stamp };
const workout = { ...EMPTY_WORKOUT_MEASUREMENTS, id: 'workout', planId: 'block', date: '2026-12-31', phase: 'Peak', type: 'Easy Run', plannedWorkout: '5 mi easy', targetPace: '', done: true, actualDistance: 5, actualPace: '', effort: null, pain: '', notes: '', sourceRow: null, originalSource: null, version: 2, updatedAt: stamp, plannedDistance: 5, targetMetric: 'distance', actualDurationSeconds: 0 };
const rest = { id: 'rest', planId: 'block', date: '2027-01-01', version: 1, updatedAt: stamp };
const backup = { schemaVersion: 3, exportedAt: stamp, blocks: [block], workouts: [workout], restDays: [rest] };

test('v3 backups preserve measurements and cross-year rest dates without treating absence as rest', () => {
  assert.deepEqual(normalizeTrainingBackup(backup), {...backup,schemaVersion:4});
  const legacy = normalizeTrainingBackup({ schemaVersion: 1, exportedAt: stamp, plan: block, workouts: [] });
  assert.deepEqual(legacy.restDays, []);
  assert.equal(legacy.schemaVersion, 4);
  const { plannedDistance, ...missing } = workout;
  for (const invalid of [
    { ...backup, restDays: undefined }, { ...backup, workouts: [missing] },
    { ...backup, restDays: [rest, rest] }, { ...backup, restDays: [{ ...rest, planId: 'other' }] },
    { ...backup, restDays: [{ ...rest, date: workout.date }] },
    { ...backup, restDays: [{ ...rest, date: '2027-02-29' }] },
    { ...backup, restDays: [{ ...rest, version: 0 }] },
  ]) assert.throws(() => normalizeTrainingBackup(invalid));
  assert.equal(normalizeTrainingBackup({ ...backup, restDays: [{ ...rest, date: '2028-02-29' }] }).restDays[0].date, '2028-02-29');
});

test('v4 requires numeric-pace fields while v3 supplies null without parsing descriptions', () => {
  const legacy = structuredClone(backup);
  delete legacy.workouts[0].plannedPaceSecondsPerMile;
  delete legacy.workouts[0].actualPaceSecondsPerMile;
  const normalized = normalizeTrainingBackup(legacy);
  assert.equal(normalized.workouts[0].plannedPaceSecondsPerMile,null);
  assert.equal(normalized.schemaVersion,4);
  assert.throws(()=>normalizeTrainingBackup({...legacy,schemaVersion:4}));
});

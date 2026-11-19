import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentWorkouts, blockMileage, journey, todayWorkout } from '../lib/block-overview.ts';
import { WORKOUT_PERIODS, periodForHour } from '../lib/workout-period.ts';
import { EMPTY_WORKOUT_MEASUREMENTS, validateWorkout } from '../lib/domain.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

const stamp = '2026-11-18T12:00:00.000Z';
const plan = { id: 'test', status: 'active', raceName: 'Winter half', raceDate: '2027-01-10', paceGuide: [], sourceName: null, version: 1, createdAt: stamp, updatedAt: stamp };
const row = (id, date, extra = {}) => ({ ...EMPTY_WORKOUT_MEASUREMENTS, id, planId: plan.id, date, phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Easy effort', targetPace: '', done: false, actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', sourceRow: null, originalSource: null, version: 1, updatedAt: stamp, ...extra });
const data = workouts => ({ plan, workouts, restDays: [], today: '2026-12-31', displayName: 'Runner' });

test('period boundaries use local hour and cover all 24 hours', () => {
  assert.deepEqual(Array.from({ length: 24 }, (_, hour) => periodForHour(hour)), [
    ...Array(5).fill('night'), ...Array(7).fill('morning'), ...Array(5).fill('afternoon'), ...Array(4).fill('evening'), ...Array(3).fill('night')]);
});
test('navigation visits each same-day workout, stops at endpoints, and supports an unscheduled today', () => {
  const rows = [row('future', '2027-01-02'), row('second', '2026-12-31', { sourceRow: 2 }), row('past', '2026-12-30'), row('first', '2026-12-31', { sourceRow: 1 })];
  assert.equal(todayWorkout(rows, '2026-12-31').id, 'first');
  assert.equal(todayWorkout(rows.map(row => ({ ...row, done: row.id === 'first' })), '2026-12-31').id, 'second');
  assert.deepEqual(adjacentWorkouts(rows, '2026-12-31', rows[3]), { previous: rows[2], next: rows[1] });
  assert.equal(adjacentWorkouts(rows, '2026-12-31', rows[2]).previous, null);
  assert.equal(adjacentWorkouts(rows, '2026-12-31', rows[0]).next, null);
  assert.deepEqual(adjacentWorkouts(rows, '2027-01-01', null), { previous: rows[1], next: rows[0] });
  assert.equal(todayWorkout(rows, '2027-01-01'), null);
});
test('block mileage keeps a cross-year week whole, counts only completed runs, and preserves unknown/zero', () => {
  const weeks = blockMileage(data([row('dec', '2026-12-31', { done: true, plannedDistance: 5, actualDistance: 4 }), row('jan', '2027-01-02', { done: true, plannedDistance: 6, actualDistance: 0 }), row('support', '2027-01-01', { type: 'Strength', plannedDistance: 99, actualDistance: 99, done: true }), row('unknown', '2027-01-03', { done: true }), row('future', '2027-01-04', { plannedDistance: 7, actualDistance: 20 })]));
  assert.equal(weeks.length, 2);
  assert.deepEqual(weeks.map(week => [week.start, week.end, week.planned, week.recorded, week.missingPlanned, week.missingRecorded]), [['2026-12-28', '2027-01-03', 11, 4, 1, 1], ['2027-01-04', '2027-01-10', 7, null, 0, 0]]);
});
test('journey uses saved start, race end, clamps dates, and handles missing/reversed/same-day dates', () => {
  const initial = data([row('first', '2026-12-21')]);
  const current = journey(initial);
  assert.equal(current.week, 2); assert.equal(current.totalWeeks, 3); assert.equal(current.percent, 50);
  assert.equal(journey({ ...initial, today: '2026-01-01' }).percent, 0);
  assert.equal(journey({ ...initial, today: '2027-02-01' }).percent, 100);
  assert.equal(journey({ ...initial, plan: { ...plan, setup: { goal: { startDate: '2026-12-28' } } } }).start, '2026-12-28');
  assert.equal(journey(data([])), null);
  assert.equal(journey({ ...initial, plan: { ...plan, raceDate: '2026-12-20' } }), null);
  assert.equal(journey({ ...initial, plan: { ...plan, raceDate: '2026-12-21' } }).percent, 100);
});
test('period validation and backups preserve explicit periods and leave old records unspecified', () => {
  const workout = row('period', '2026-12-31');
  assert.equal('timeOfDay' in validateWorkout(workout), false);
  for (const timeOfDay of [...WORKOUT_PERIODS, null]) {
    assert.equal(validateWorkout({ ...workout, timeOfDay }).timeOfDay, timeOfDay);
    const backup = normalizeTrainingBackup({ schemaVersion: 7, exportedAt: stamp, blocks: [plan], workouts: [{ ...workout, timeOfDay }], restDays: [] });
    assert.equal(backup.workouts[0].timeOfDay, timeOfDay);
  }
  for (const timeOfDay of ['dawn', 12, {}, true]) assert.throws(() => validateWorkout({ ...workout, timeOfDay }));
  const legacy = normalizeTrainingBackup({ schemaVersion: 6, exportedAt: stamp, blocks: [plan], workouts: [workout], restDays: [] });
  assert.equal(legacy.workouts[0].timeOfDay, null);
});

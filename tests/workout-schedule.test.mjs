import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDates, shiftMonth, initialScheduleDate, scheduleTarget } from '../lib/workout-schedule.ts';
import { EMPTY_WORKOUT_MEASUREMENTS } from '../lib/domain.ts';

const data = { today: '2026-12-31', plan: { raceDate: '2027-01-17' }, workouts: [{ date: '2026-11-02' }], restDays: [] };
test('Monday–Sunday month grids cover every date, including leap days and year transitions', () => {
  for (const month of ['1900-02-01', '2000-02-01', '2024-02-01', '2026-12-01', '2027-01-01', '2200-12-01']) {
    const dates = monthDates(month), prefix = month.slice(0, 7);
    assert.equal(dates.length % 7, 0);
    assert.equal(new Date(dates[0] + 'T12:00:00Z').getUTCDay(), 1);
    assert.equal(new Date(dates.at(-1) + 'T12:00:00Z').getUTCDay(), 0);
    assert.equal(new Set(dates).size, dates.length);
    const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    assert.equal(dates.filter(date => date.startsWith(prefix)).length, count);
  }
  assert.ok(monthDates('2000-02-01').includes('2000-02-29'));
  assert.ok(!monthDates('1900-02-01').includes('1900-02-29'));
  assert.ok(monthDates('2026-12-01').includes('2027-01-03'));
});
test('month navigation crosses years and stops at supported date boundaries', () => {
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftMonth('2027-01-01', -1), '2026-12-01');
  assert.equal(shiftMonth('1900-01-01', -1), null);
  assert.equal(shiftMonth('2200-12-01', 1), null);
});
test('entry date preserves a valid deep link and otherwise uses today or closest block endpoint', () => {
  assert.equal(initialScheduleDate(data), data.today);
  assert.equal(initialScheduleDate({ ...data, today: '2026-01-01' }), '2026-11-02');
  assert.equal(initialScheduleDate({ ...data, today: '2028-01-01' }), '2027-01-17');
  assert.equal(initialScheduleDate(data, '2027-01-05'), '2027-01-05');
  assert.equal(initialScheduleDate(data, '2027-02-30'), data.today);
});
test('schedule summaries preserve unknown and zero; support sessions use duration rather than mileage', () => {
  const row = { ...EMPTY_WORKOUT_MEASUREMENTS, type: 'Easy Run', plannedWorkout: 'Run 7 miles in 90 minutes' };
  assert.equal(scheduleTarget(row), 'Distance not set');
  assert.equal(scheduleTarget({ ...row, plannedDistance: 0 }), '0 mi');
  assert.equal(scheduleTarget({ ...row, plannedDistance: 5.5 }), '5.5 mi');
  assert.equal(scheduleTarget({ ...row, type: 'Strength', plannedDistance: 99 }), 'Duration not set');
  assert.match(scheduleTarget({ ...row, type: 'Mobility', plannedDurationSeconds: 1200 }), /20/);
});

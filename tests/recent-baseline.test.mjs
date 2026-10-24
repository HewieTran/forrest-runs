import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecentBaseline } from '../lib/recent-baseline.ts';
const run = (date, actualDistance = 4) => ({ date, type: 'Easy Run', done: true, actualDistance });
const rows = [run('2026-09-28'), run('2026-10-05'), run('2026-10-12'), run('2026-10-19')];
test('four recorded weeks give an explicit suggestion from actual running only', () => {
  assert.deepEqual(summarizeRecentBaseline([...rows, { ...run('2026-10-12', 100), type: 'Strength' }, { ...run('2026-10-13', 100), done: false }, run('2026-10-24', 100)], '2026-10-24'), { from: '2026-09-26', to: '2026-10-23', weeklyDistanceMiles: 4, longestRunMiles: 4, runsPerWeek: 1 });
});
test('incomplete weeks or missing actual distances never become zero-mileage suggestions', () => {
  assert.equal(summarizeRecentBaseline(rows.slice(1), '2026-10-24'), null);
  assert.equal(summarizeRecentBaseline([...rows, run('2026-10-13', null)], '2026-10-24'), null);
  assert.equal(summarizeRecentBaseline([], '2026-10-24'), null);
});
test('multiple workouts on one date count as one running day', () => {
  assert.equal(summarizeRecentBaseline([...rows, run('2026-10-12', 2)], '2026-10-24').runsPerWeek, 1);
});

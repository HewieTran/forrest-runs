import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySetup, validateSetup, setupIssues, convertSetupUnits, durationSeconds } from '../lib/setup.ts';
import { exampleSetup } from './setup-fixture.mjs';
import { normalizeTrainingBackup } from '../lib/backups.ts';

test('partial drafts retain blank measurements and supplied zero distances without guessing', () => {
  const draft = emptySetup('Later goal', '2027-05-01');
  draft.baseline.weeklyDistance = 0;
  draft.baseline.longestRun = 0;
  assert.deepEqual(validateSetup(draft, '2026-10-23'), draft);
  assert.ok(setupIssues(draft).some(issue => issue.field === 'results'));
  assert.equal(draft.runner.vo2, null);
});
test('complete input requires a dated best effort; VO2 is optional and cannot replace it', () => {
  const setup = exampleSetup();
  assert.deepEqual(setupIssues(validateSetup(setup, '2026-10-23')), []);
  setup.runner.vo2 = { value: 44, source: 'Watch estimate', date: '2026-10-20' };
  assert.deepEqual(setupIssues(validateSetup(setup, '2026-10-23')), []);
  setup.baseline.results['5k'] = { time: '', date: '', source: 'race' };
  assert.ok(setupIssues(setup).some(issue => issue.field === 'results'));
  setup.runner.vo2.date = '';
  assert.ok(setupIssues(setup).some(issue => issue.field === 'vo2'));
});
test('provided invalid values, future benchmarks, duplicate days, and contradictory dates fail', () => {
  const invalid = [
    s => { s.runner.age = 0; }, s => { s.runner.weight = -1; }, s => { s.runner.height = Infinity; },
    s => { s.baseline.runsPerWeek = 8; }, s => { s.baseline.results['5k'].time = '20:60'; },
    s => { s.baseline.results['5k'].date = '2026-10-24'; },
    s => { s.runner.vo2 = { value: 44, source: 'Watch', date: '2026-10-24' }; },
    s => { s.availability.days = [1, 1]; }, s => { s.availability.longRunDay = 0; },
    s => { s.goal.targetDate = s.goal.startDate; }, s => { s.goal.distanceKm = -5; },
    s => { s.goal.targetTime = '0:00'; }, s => { s.schemaVersion = 2; },
  ];
  for (const alter of invalid) { const value = exampleSetup(); alter(value); assert.throws(() => validateSetup(value, '2026-10-23')); }
  const paired = exampleSetup(); paired.baseline.results['10k'].date = '2026-10-01';
  assert.ok(setupIssues(paired).some(issue => issue.field === '10k'));
  assert.equal(durationSeconds('28:30'), 1710);
  assert.equal(durationSeconds('2:45:00'), 9900);
});
test('unit changes convert measurements, retain canonical goal distance, and keep time and dates', () => {
  const metric = exampleSetup();
  const imperial = convertSetupUnits(metric, 'mi');
  assert.ok(Math.abs(imperial.runner.weight - 154.3236) < 0.001);
  assert.ok(Math.abs(imperial.runner.height - 68.8976) < 0.001);
  assert.ok(Math.abs(imperial.baseline.weeklyDistance - 12.4274) < 0.001);
  assert.deepEqual(imperial.goal, metric.goal);
  assert.deepEqual(imperial.baseline.results, metric.baseline.results);
  const back = convertSetupUnits(imperial, 'km');
  assert.ok(Math.abs(back.runner.weight - metric.runner.weight) < 0.001);
  const partial = emptySetup(); partial.baseline.weeklyDistance = 0;
  assert.equal(convertSetupUnits(partial, 'km').runner.weight, null);
  assert.equal(convertSetupUnits(partial, 'km').baseline.weeklyDistance, 0);
});
test('backup normalization retains saved runner snapshots and strips untrusted setup properties', () => {
  const timestamp = '2026-10-23T00:00:00.000Z';
  const block = { id: 'snapshot', status: 'draft', raceName: 'Spring 10K', raceDate: '2027-03-14', paceGuide: [], sourceName: null, version: 2, createdAt: timestamp, updatedAt: timestamp, setup: exampleSetup() };
  const backup = { schemaVersion: 2, exportedAt: timestamp, blocks: [block], workouts: [] };
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  const untrusted = structuredClone(backup); untrusted.blocks[0].setup.ownerId = 'foreign'; untrusted.blocks[0].setup.approved = true;
  assert.deepEqual(normalizeTrainingBackup(untrusted), backup);
});

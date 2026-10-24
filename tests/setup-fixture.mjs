import { emptySetup } from '../lib/setup.ts';

export function exampleSetup() {
  const setup = emptySetup('Spring 5K', '2027-03-14', '2026-10-26');
  setup.step = 4; setup.units = 'km';
  setup.runner = { ...setup.runner, age: 35, weight: 70, height: 175 };
  setup.baseline = { ...setup.baseline, weeklyDistance: 20, longestRun: 8, runsPerWeek: 3, trainingChanges: 'none',
    results: { ...setup.baseline.results, '5k': { time: '28:30', date: '2026-10-01', source: 'time-trial' } } };
  setup.goal = { ...setup.goal, distanceKm: 5, mode: 'time', paceGuidance: 'performance', targetTime: '25:00' };
  setup.availability = { ...setup.availability, days: [1, 3, 6], longRunDay: 6, maxSessionDurationSeconds: 2700, dayDurationLimits: { '6': 5400 } };
  return setup;
}
export function legacySetup() {
  const setup = exampleSetup();
  const { experience: _, ...runner } = setup.runner;
  const { mode: _mode, paceGuidance: _pace, ...goal } = setup.goal;
  const { trainingChanges: _changes, trainingChangesNotes: _notes, ...baseline } = setup.baseline;
  const { maxSessionDurationSeconds: _limit, dayDurationLimits: _overrides, otherCommitments: _commitments, ...availability } = setup.availability;
  return { ...setup, schemaVersion: 1, runner, goal, baseline, availability };
}

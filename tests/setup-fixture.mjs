import { emptySetup } from '../lib/setup.ts';

export function exampleSetup() {
  const setup = emptySetup('Spring 10K', '2027-03-14');
  setup.step = 4; setup.units = 'km';
  setup.runner = { age: 35, weight: 70, height: 175, vo2: null };
  setup.baseline = { weeklyDistance: 20, longestRun: 8, runsPerWeek: 3,
    results: { ...setup.baseline.results, '5k': { time: '28:30', date: '2026-10-01', source: 'time-trial' } } };
  setup.goal = { ...setup.goal, distanceKm: 10, targetTime: '1:00:00', startDate: '2026-10-26' };
  setup.availability = { days: [1, 3, 6], longRunDay: 6 };
  return setup;
}

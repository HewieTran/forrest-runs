import { addDays, EMPTY_WORKOUT_MEASUREMENTS, type AppData, type Workout } from './domain';

// Synthetic examples for the development-only /preview route; never private history.
export function progressPreview(scenario?: string): AppData {
  const stamp = '2026-10-23T12:00:00.000Z', start = '2026-09-07', workouts: Workout[] = [], restDays: AppData['restDays'] = [];
  for (let day = 0; day < 168; day++) {
    const date = addDays(start, day), weekday = day % 7, week = Math.floor(day / 7);
    if (weekday === 6) { restDays.push({ id: `rest-${day}`, planId: 'example', date, version: 1, updatedAt: stamp }); continue; }
    const support = weekday === 1 || weekday === 4, planned = weekday === 5 ? 8 + week % 12 : 3 + week % 4;
    const done = date < '2026-10-23' && day % 13 !== 0, result = day % 9 === 0 ? .8 : day % 7 === 0 ? 1.15 : 1;
    workouts.push({ ...EMPTY_WORKOUT_MEASUREMENTS, id: `progress-${day}`, planId: 'example', date, phase: 'Base Build', type: support ? weekday === 1 ? 'Strength' : 'Mobility' : weekday === 5 ? 'Long Run' : 'Easy Run', plannedWorkout: support ? 'Controlled strength and mobility' : `${planned} miles at a conversational effort`, targetPace: '', done, plannedDistance: support ? null : planned, plannedDurationSeconds: support ? 1800 : null, targetMetric: support ? 'duration' : 'distance', actualDistance: !support && done ? Number((planned * result).toFixed(2)) : null, actualDurationSeconds: support && done ? Math.round(1800 * result) : null, actualPace: '', effort: null, pain: '', notes: '', sourceRow: null, originalSource: null, version: 1, updatedAt: stamp });
  }
  const unknown = workouts.find(row => row.date === '2026-10-21')!;
  Object.assign(unknown, EMPTY_WORKOUT_MEASUREMENTS);
  const double = workouts.find(row => row.date === '2026-10-22')!;
  workouts.push({ ...double, id: 'second-session', type: 'Strength', done: false, actualDistance: null, ...EMPTY_WORKOUT_MEASUREMENTS });
  const data: AppData = { today: '2026-10-23', displayName: 'Runner', plan: { id: 'example', status: 'active', raceName: 'Spring Marathon', raceDate: '2027-02-21', paceGuide: [], sourceName: null, version: 1, createdAt: stamp, updatedAt: stamp }, workouts, restDays };
  if (scenario === 'legacy') { data.workouts = workouts.map(row => ({ ...row, ...EMPTY_WORKOUT_MEASUREMENTS })); data.restDays = []; }
  if (scenario === 'empty') { data.workouts = []; data.restDays = []; }
  if (scenario === 'long') { data.plan.raceDate = '2200-12-31'; }
  return data;
}

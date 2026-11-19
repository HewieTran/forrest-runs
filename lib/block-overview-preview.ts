import { addDays, weekStart, EMPTY_WORKOUT_MEASUREMENTS, type AppData, type Workout } from './domain';

// Disposable, development-only examples. These never load or seed account data.
export function overviewPreview(today: string, scenario = ''): AppData {
  const stamp = '2026-11-18T12:00:00.000Z';
  const start = addDays(weekStart(today), -14), end = addDays(start, 76);
  const workouts: Workout[] = [], restDays: AppData['restDays'] = [];
  for (let day = 0; day <= 76; day++) {
    const date = addDays(start, day), weekday = day % 7;
    if (weekday === 6) {
      restDays.push({ id: `rest-${day}`, planId: 'overview-example', date, version: 1, updatedAt: stamp });
      continue;
    }
    const support = weekday === 1 || weekday === 4;
    const distance = weekday === 5 ? 10 : 5;
    const done = date < today && day % 8 !== 0;
    workouts.push({ ...EMPTY_WORKOUT_MEASUREMENTS, id: `overview-${day}`, planId: 'overview-example', date,
      phase: day < 28 ? 'Base Build' : day < 63 ? 'Peak' : 'Taper', type: support ? 'Strength' : weekday === 5 ? 'Long Run' : 'Easy Run',
      plannedWorkout: support ? 'Controlled strength; keep legs fresh.' : 'Keep it easy enough to talk.', targetPace: support ? 'Controlled effort' : '',
      plannedDistance: support ? null : distance, plannedPaceSecondsPerMile: support ? null : 780,
      plannedDurationSeconds: support ? 1800 : distance * 780, targetMetric: support ? 'duration' : 'distance',
      done, actualDistance: done && !support ? distance : null, actualDurationSeconds: done ? support ? 1800 : distance * 780 : null,
      actualPace: '', actualPaceSecondsPerMile: done && !support ? 780 : null, timeOfDay: done ? 'morning' : null,
      effort: null, pain: '', notes: '', sourceRow: day + 1, originalSource: null, version: 1, updatedAt: stamp });
  }
  const current = workouts.find(row => row.date === today);
  if (current) workouts.push({ ...current, id: 'overview-today-mobility', type: 'Mobility', plannedWorkout: 'A little movement after your run.', plannedDistance: null, plannedPaceSecondsPerMile: null, plannedDurationSeconds: 1200, targetMetric: 'duration', sourceRow: 1000 });
  const data: AppData = { today, displayName: 'Runner', plan: { id: 'overview-example', status: 'active', raceName: 'Winter Half Marathon', raceDate: end,
    paceGuide: [{ type: 'Easy', target: '12:45–13:45 /mi', rule: 'Keep a conversational effort.' }, { type: 'Long', target: '13:00–14:00 /mi', rule: 'Steady and comfortable.' }], sourceName: null, version: 1, createdAt: stamp, updatedAt: stamp }, workouts, restDays };
  if (scenario === 'rest' || scenario === 'unscheduled') {
    data.workouts = workouts.filter(row => row.date !== today);
    data.restDays = restDays.filter(row => row.date !== today);
    if (scenario === 'rest') data.restDays.push({ id: 'rest-today', planId: data.plan.id, date: today, version: 1, updatedAt: stamp });
  }
  if (scenario === 'empty') { data.workouts = []; data.restDays = []; data.plan.status = 'draft'; }
  return data;
}

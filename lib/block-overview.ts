import { addDays, dateDiff, isRun, validDate, weekStart, type AppData, type Workout } from './domain.ts';
import { runningMileage } from './progress.ts';

export { WORKOUT_PERIODS, PERIOD_LABELS, periodArtwork, periodForHour, type WorkoutPeriod } from './workout-period.ts';

export function orderedWorkouts(workouts: Workout[]) {
  return [...workouts].sort((a, b) => a.date.localeCompare(b.date) ||
    (a.sourceRow ?? Number.MAX_SAFE_INTEGER) - (b.sourceRow ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
}
export function todayWorkout(workouts: Workout[], today: string) {
  const rows = orderedWorkouts(workouts).filter(row => row.date === today);
  return rows.find(row => !row.done) ?? rows[0] ?? null;
}
export function adjacentWorkouts(workouts: Workout[], today: string, current: Workout | null) {
  const rows = orderedWorkouts(workouts);
  const index = current ? rows.findIndex(row => row.id === current.id) : -1;
  return index >= 0 ? { previous: rows[index - 1] ?? null, next: rows[index + 1] ?? null } : {
    previous: rows.filter(row => row.date < today).at(-1) ?? null,
    next: rows.find(row => row.date > today) ?? null,
  };
}

export function journey(data: AppData) {
  const savedStart = data.plan.setup?.goal.startDate;
  const start = validDate(savedStart) ? savedStart :
    [...data.workouts, ...data.restDays].map(row => row.date).filter(validDate).sort()[0];
  const end = data.plan.raceDate;
  if (!start || !validDate(end) || end < start) return null;
  const span = dateDiff(end, start);
  const elapsed = dateDiff(data.today, start);
  const totalWeeks = Math.floor(span / 7) + 1;
  return { start, end, percent: span === 0 ? (elapsed < 0 ? 0 : 100) : Math.max(0, Math.min(100, elapsed / span * 100)),
    week: Math.max(1, Math.min(totalWeeks, Math.floor(elapsed / 7) + 1)), totalWeeks,
    state: elapsed < 0 ? 'Starts soon' : elapsed > span ? 'Block finished' : 'Current training week' };
}

// Keep each whole Monday–Sunday bucket, including a week crossing New Year.
export function blockMileage(data: AppData) {
  const dates = [data.plan.setup?.goal.startDate, data.plan.raceDate,
    ...data.workouts.map(row => row.date), ...data.restDays.map(row => row.date)].filter(validDate).sort();
  const first = weekStart(dates[0] ?? data.today);
  const last = weekStart(dates.at(-1) ?? data.today);
  const byWeek = new Map<string, Workout[]>();
  for (const row of data.workouts.filter(isRun)) {
    const start = weekStart(row.date);
    byWeek.set(start, [...(byWeek.get(start) ?? []), row]);
  }
  return Array.from({ length: Math.floor(dateDiff(last, first) / 7) + 1 }, (_, index) => {
    const start = addDays(first, index * 7);
    return { start, end: addDays(start, 6), ...runningMileage(byWeek.get(start) ?? []) };
  });
}

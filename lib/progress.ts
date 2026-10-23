import { addDays, dateDiff, isRun, validDate, weekStart, type AppData, type Workout } from './domain.ts';

export type TargetResult = 'below' | 'met' | 'above' | 'unknown';
export type DayState = TargetResult | 'partial' | 'missed' | 'upcoming' | 'rest' | 'empty' | 'outside';
export const DAY_LABELS: Record<DayState, string> = {
  below: 'Completed · below target', met: 'Completed · target met', above: 'Completed · above target',
  unknown: 'Completed · comparison unavailable', partial: 'Some workouts completed',
  missed: 'No completed workout', upcoming: 'Today / upcoming', rest: 'Planned rest day',
  empty: 'Unscheduled', outside: 'Outside this block',
};

export function targetResult(workout: Workout): TargetResult {
  const planned = workout.targetMetric === 'distance' ? workout.plannedDistance : workout.targetMetric === 'duration' ? workout.plannedDurationSeconds : null;
  const actual = workout.targetMetric === 'distance' ? workout.actualDistance : workout.targetMetric === 'duration' ? workout.actualDurationSeconds : null;
  if (!workout.done || planned === null || actual === null) return 'unknown';
  if (Math.abs(actual - planned) < 0.000001) return 'met';
  return actual > planned ? 'above' : 'below';
}

export function completionGroups(workouts: Workout[], today: string) {
  const due = workouts.filter(workout => workout.date < today);
  return [
    { label: 'Total workouts', rows: due },
    { label: 'Runs', rows: due.filter(isRun) },
    { label: 'Strength & mobility', rows: due.filter(workout => !isRun(workout)) },
  ].map(({ label, rows }) => {
    const completed = rows.filter(workout => workout.done).length;
    return { label, completed, scheduled: rows.length, percent: rows.length ? Math.round(completed / rows.length * 100) : null };
  });
}

export function blockRange(data: AppData) {
  const dates = [data.plan.raceDate, data.plan.setup?.goal.startDate, data.plan.setup?.goal.targetDate,
    ...data.workouts.map(row => row.date), ...data.restDays.map(row => row.date)].filter(validDate).sort();
  return { start: dates[0] ?? data.today, end: dates.at(-1) ?? data.today };
}

export function calendarIndex(data: AppData) {
  const workouts = new Map<string, Workout[]>();
  for (const workout of data.workouts) workouts.set(workout.date, [...(workouts.get(workout.date) ?? []), workout]);
  return { workouts, rest: new Set(data.restDays.map(row => row.date)), range: blockRange(data) };
}

export function dayState(date: string, today: string, index: ReturnType<typeof calendarIndex>): DayState {
  if (date < index.range.start || date > index.range.end) return 'outside';
  if (index.rest.has(date)) return 'rest';
  const rows = index.workouts.get(date) ?? [];
  if (!rows.length) return 'empty';
  const completed = rows.filter(row => row.done);
  if (!completed.length) return date < today ? 'missed' : 'upcoming';
  if (completed.length !== rows.length) return 'partial';
  const results = completed.map(targetResult);
  // A day earns "target met" only when every workout can be compared.
  if (results.includes('below')) return 'below';
  if (results.includes('unknown')) return 'unknown';
  return results.includes('above') ? 'above' : 'met';
}

export function calendarYears(range: { start: string; end: string }) {
  return Array.from({ length: Number(range.end.slice(0, 4)) - Number(range.start.slice(0, 4)) + 1 }, (_, i) => Number(range.start.slice(0, 4)) + i);
}

export function annualMileage(workouts: Workout[], year: number) {
  const start = `${year}-01-01`, end = `${year}-12-31`, firstWeek = weekStart(start);
  const runs = workouts.filter(row => isRun(row) && row.date >= start && row.date <= end);
  const byWeek = new Map<string, Workout[]>();
  for (const row of runs) byWeek.set(weekStart(row.date), [...(byWeek.get(weekStart(row.date)) ?? []), row]);
  return Array.from({ length: Math.floor(dateDiff(end, firstWeek) / 7) + 1 }, (_, i) => {
    const week = addDays(firstWeek, i * 7), rows = byWeek.get(week) ?? [], completed = rows.filter(row => row.done);
    const plannedKnown = rows.filter(row => row.plannedDistance !== null);
    const recordedKnown = completed.filter(row => row.actualDistance !== null);
    return {
      start: week < start ? start : week, end: addDays(week, 6) > end ? end : addDays(week, 6),
      planned: plannedKnown.length ? plannedKnown.reduce((sum, row) => sum + row.plannedDistance!, 0) : null,
      recorded: recordedKnown.length ? recordedKnown.reduce((sum, row) => sum + row.actualDistance!, 0) : null,
      missingPlanned: rows.length - plannedKnown.length, missingRecorded: completed.length - recordedKnown.length,
      scheduled: rows.length, completed: completed.length,
    };
  });
}

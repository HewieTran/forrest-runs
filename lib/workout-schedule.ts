import { addDays, isRun, validDate, weekStart, type AppData, type Workout } from './domain.ts';
import { blockRange } from './progress.ts';
import { readableDuration } from './workout-structure.ts';

export const monthStart = (date: string) => date.slice(0, 7) + '-01';

export function shiftMonth(month: string, offset: number) {
  const date = new Date(monthStart(month) + 'T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  const value = date.toISOString().slice(0, 10);
  return validDate(value) ? value : null;
}

export function monthDates(month: string) {
  const first = monthStart(month);
  const last = new Date(first + 'T12:00:00Z');
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const lastDate = last.toISOString().slice(0, 10);
  const start = weekStart(first), end = addDays(weekStart(lastDate), 6);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function initialScheduleDate(data: AppData, requested?: string) {
  if (validDate(requested)) return requested;
  const { start, end } = blockRange(data);
  return data.today < start ? start : data.today > end ? end : data.today;
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export function scheduleTarget(workout: Workout, unit: 'mi' | 'km' = 'mi') {
  if (isRun(workout)) return workout.plannedDistance === null ? 'Distance not set' : `${number.format(workout.plannedDistance * (unit === 'km' ? 1.609344 : 1))} ${unit}`;
  return workout.plannedDurationSeconds === null ? 'Duration not set' : readableDuration(workout.plannedDurationSeconds);
}
export function shortWorkoutTitle(workout: Workout) {
  return ({ 'Easy Run': 'Easy', 'Quality Run': 'Quality', 'Long Run': 'Long', 'Strength': 'Str.', 'Mobility': 'Mob.', 'Race': 'Race' })[workout.type] ?? workout.type;
}

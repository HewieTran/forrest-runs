export const TYPES = [
  'Easy Run',
  'Quality Run',
  'Long Run',
  'Race',
  'Strength',
  'Mobility',
] as const;
export const PHASES = [
  'Base Build',
  'Summer Durability',
  'Marathon Build',
  'Peak',
  'Taper',
  'Race Week',
] as const;
export type PaceGuide = { type: string; target: string; rule: string };
export type Plan = {
  id: string;
  raceName: string;
  raceDate: string;
  paceGuide: PaceGuide[];
  sourceName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type Workout = {
  id: string;
  planId: string;
  date: string;
  phase: string;
  type: string;
  plannedWorkout: string;
  targetPace: string;
  done: boolean;
  actualDistance: number | null;
  actualPace: string;
  effort: number | null;
  pain: string;
  notes: string;
  sourceRow: number | null;
  originalSource: Record<string, unknown> | null;
  version: number;
  updatedAt: string;
};
export type AppData = {
  plan: Plan;
  workouts: Workout[];
  displayName: string;
  today: string;
};
export type WorkoutInput = Pick<
  Workout,
  | 'date'
  | 'phase'
  | 'type'
  | 'plannedWorkout'
  | 'targetPace'
  | 'done'
  | 'actualDistance'
  | 'actualPace'
  | 'effort'
  | 'pain'
  | 'notes'
  | 'version'
>;
export function isRun(w: Pick<Workout, 'type'>) {
  return w.type !== 'Strength' && w.type !== 'Mobility';
}
export function validDate(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number(v.slice(0, 4)) >= 1900 &&
    Number(v.slice(0, 4)) <= 2200 &&
    !Number.isNaN(Date.parse(v + 'T12:00:00Z')) &&
    new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v
  );
}
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function centralToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
}
export function dateDiff(a: string, b: string) {
  return Math.round(
    (Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000,
  );
}
export function summarize(rows: Workout[], today: string) {
  const completed = rows.filter((w) => w.done),
    runs = completed.filter(isRun),
    distances = runs.flatMap((w) =>
      w.actualDistance === null ? [] : [w.actualDistance],
    );
  const due = rows.filter((w) => w.date < today);
  return {
    total: rows.length,
    completed: completed.length,
    runs: runs.length,
    support: completed.length - runs.length,
    miles: Math.round(distances.reduce((a, b) => a + b, 0) * 100) / 100,
    longest: distances.length ? Math.max(...distances) : null,
    missingDistance: runs.filter((w) => w.actualDistance === null).length,
    percent: rows.length
      ? Math.round((completed.length / rows.length) * 100)
      : 0,
    due: due.length,
    dueCompleted: due.filter((w) => w.done).length,
  };
}
export function distanceMilestones(rows: Workout[]) {
  return [10, 13.1, 16, 18, 20].map((distance) => ({
    distance,
    workout:
      rows
        .filter(
          (w) =>
            w.done &&
            isRun(w) &&
            w.actualDistance !== null &&
            w.actualDistance >= distance - 0.000001,
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
  }));
}
export function phaseMilestones(rows: Workout[], today: string) {
  return PHASES.map((phase) => {
    const list = rows
      .filter((w) => w.phase === phase)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      phase,
      total: list.length,
      done: list.filter((w) => w.done).length,
      start: list[0]?.date ?? null,
      end: list.at(-1)?.date ?? null,
      state: !list.length
        ? 'empty'
        : list.every((w) => w.done)
          ? 'complete'
          : today < list[0].date
            ? 'upcoming'
            : today > list.at(-1)!.date
              ? 'past'
              : 'current',
    };
  });
}
export function mileageWeeks(rows: Workout[], selectedWeek: string) {
  return Array.from({ length: 6 }, (_, i) => {
    const start = addDays(selectedWeek, (i - 5) * 7),
      end = addDays(start, 6),
      runs = rows.filter(
        (w) => w.done && isRun(w) && w.date >= start && w.date <= end,
      );
    return {
      start,
      miles:
        Math.round(
          runs.reduce((sum, w) => sum + (w.actualDistance ?? 0), 0) * 10,
        ) / 10,
      missing: runs.filter((w) => w.actualDistance === null).length,
    };
  });
}
export function validateWorkout(input: unknown): WorkoutInput {
  if (!input || typeof input !== 'object')
    throw new Error('Enter valid workout details.');
  const v = input as Record<string, unknown>;
  if (!validDate(v.date)) throw new Error('Enter a valid workout date.');
  if (!PHASES.includes(v.phase as (typeof PHASES)[number]))
    throw new Error('Choose a training phase.');
  if (!TYPES.includes(v.type as (typeof TYPES)[number]))
    throw new Error('Choose a workout type.');
  if (typeof v.done !== 'boolean')
    throw new Error('Choose a completion status.');
  if (!Number.isInteger(v.version) || Number(v.version) < 1)
    throw new Error('Reload this workout before saving.');
  for (const key of [
    'plannedWorkout',
    'targetPace',
    'actualPace',
    'pain',
    'notes',
  ])
    if (
      typeof v[key] !== 'string' ||
      (v[key] as string).length > (key === 'notes' ? 10000 : 1000)
    )
      throw new Error('A workout field is missing or too long.');
  if (!(v.plannedWorkout as string).trim())
    throw new Error('Add a planned workout description.');
  if (
    v.actualDistance !== null &&
    (typeof v.actualDistance !== 'number' ||
      !Number.isFinite(v.actualDistance) ||
      v.actualDistance < 0 ||
      v.actualDistance > 1000)
  )
    throw new Error(
      'Distance must be between 0 and 1,000 miles, or left blank.',
    );
  if (
    v.effort !== null &&
    (typeof v.effort !== 'number' ||
      !Number.isInteger(v.effort) ||
      v.effort < 1 ||
      v.effort > 10)
  )
    throw new Error(
      'Effort must be a whole number from 1 to 10, or left blank.',
    );
  return {
    date: v.date as string,
    phase: v.phase as string,
    type: v.type as string,
    plannedWorkout: (v.plannedWorkout as string).trim(),
    targetPace: v.targetPace as string,
    done: v.done as boolean,
    actualDistance: v.actualDistance as number | null,
    actualPace: v.actualPace as string,
    effort: v.effort as number | null,
    pain: v.pain as string,
    notes: v.notes as string,
    version: v.version as number,
  };
}

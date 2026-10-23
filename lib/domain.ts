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
export const BLOCK_STATUSES = ['draft', 'active', 'completed', 'archived'] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export type Plan = {
  id: string;
  status: BlockStatus;
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
export type RaceSettingsInput = Pick<Plan, 'raceName' | 'raceDate' | 'version'>;
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
export function isRun(workout: Pick<Workout, 'type'>) {
  return workout.type !== 'Strength' && workout.type !== 'Mobility';
}
// Reject dates that JavaScript would normalize, such as February 30.
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 2200 &&
    !Number.isNaN(Date.parse(value + 'T12:00:00Z')) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
  );
}
export function addDays(date: string, days: number) {
  const dateValue = new Date(date + 'T12:00:00Z');
  dateValue.setUTCDate(dateValue.getUTCDate() + days);
  return dateValue.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
  return addDays(date, -((dayOfWeek + 6) % 7));
}
// All users see the same training-day boundary in Central time.
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
export function dateDiff(endDate: string, startDate: string) {
  return Math.round(
    (Date.parse(endDate + 'T12:00:00Z') -
      Date.parse(startDate + 'T12:00:00Z')) /
      86400000,
  );
}
export function summarize(workouts: Workout[], today: string) {
  const completedWorkouts = workouts.filter((workout) => workout.done);
  const completedRuns = completedWorkouts.filter(isRun);
  // A missing distance stays unknown; a recorded zero is still a valid result.
  const recordedDistances = completedRuns.flatMap((workout) =>
    workout.actualDistance === null ? [] : [workout.actualDistance],
  );
  // Overall completion includes future workouts; due workouts stop at yesterday.
  const dueWorkouts = workouts.filter((workout) => workout.date < today);
  return {
    total: workouts.length,
    completed: completedWorkouts.length,
    runs: completedRuns.length,
    support: completedWorkouts.length - completedRuns.length,
    miles:
      Math.round(
        recordedDistances.reduce(
          (totalMiles, distance) => totalMiles + distance,
          0,
        ) * 100,
      ) / 100,
    longest: recordedDistances.length ? Math.max(...recordedDistances) : null,
    missingDistance: completedRuns.filter(
      (workout) => workout.actualDistance === null,
    ).length,
    percent: workouts.length
      ? Math.round((completedWorkouts.length / workouts.length) * 100)
      : 0,
    due: dueWorkouts.length,
    dueCompleted: dueWorkouts.filter((workout) => workout.done).length,
  };
}
// Small numeric tolerance avoids missing a milestone due to floating-point precision.
export function distanceMilestones(workouts: Workout[]) {
  return [10, 13.1, 16, 18, 20].map((distance) => ({
    distance,
    workout:
      workouts
        .filter(
          (workout) =>
            workout.done &&
            isRun(workout) &&
            workout.actualDistance !== null &&
            workout.actualDistance >= distance - 0.000001,
        )
        .sort((firstWorkout, secondWorkout) =>
          firstWorkout.date.localeCompare(secondWorkout.date),
        )[0] ?? null,
  }));
}
// A phase with past dates can still contain unfinished workouts.
export function phaseMilestones(workouts: Workout[], today: string) {
  return PHASES.map((phase) => {
    const phaseWorkouts = workouts
      .filter((workout) => workout.phase === phase)
      .sort((firstWorkout, secondWorkout) =>
        firstWorkout.date.localeCompare(secondWorkout.date),
      );
    return {
      phase,
      total: phaseWorkouts.length,
      done: phaseWorkouts.filter((workout) => workout.done).length,
      start: phaseWorkouts[0]?.date ?? null,
      end: phaseWorkouts.at(-1)?.date ?? null,
      state: !phaseWorkouts.length
        ? 'empty'
        : phaseWorkouts.every((workout) => workout.done)
          ? 'complete'
          : today < phaseWorkouts[0].date
            ? 'upcoming'
            : today > phaseWorkouts.at(-1)!.date
              ? 'past'
              : 'current',
    };
  });
}
// Rebucket by each workout's current date after rescheduling; weeks start Monday.
export function mileageWeeks(workouts: Workout[], selectedWeek: string) {
  return Array.from({ length: 6 }, (_, weekIndex) => {
    const weekStartDate = addDays(selectedWeek, (weekIndex - 5) * 7);
    const weekEndDate = addDays(weekStartDate, 6);
    const completedRuns = workouts.filter(
      (workout) =>
        workout.done &&
        isRun(workout) &&
        workout.date >= weekStartDate &&
        workout.date <= weekEndDate,
    );
    return {
      start: weekStartDate,
      miles:
        Math.round(
          completedRuns.reduce(
            (totalMiles, workout) => totalMiles + (workout.actualDistance ?? 0),
            0,
          ) * 10,
        ) / 10,
      missing: completedRuns.filter(
        (workout) => workout.actualDistance === null,
      ).length,
    };
  });
}
export function validateWorkout(input: unknown): WorkoutInput {
  if (!input || typeof input !== 'object')
    throw new Error('Enter valid workout details.');
  const fields = input as Record<string, unknown>;
  if (!validDate(fields.date)) throw new Error('Enter a valid workout date.');
  if (!PHASES.includes(fields.phase as (typeof PHASES)[number]))
    throw new Error('Choose a training phase.');
  if (!TYPES.includes(fields.type as (typeof TYPES)[number]))
    throw new Error('Choose a workout type.');
  if (typeof fields.done !== 'boolean')
    throw new Error('Choose a completion status.');
  if (!Number.isInteger(fields.version) || Number(fields.version) < 1)
    throw new Error('Reload this workout before saving.');
  for (const key of [
    'plannedWorkout',
    'targetPace',
    'actualPace',
    'pain',
    'notes',
  ])
    if (
      typeof fields[key] !== 'string' ||
      (fields[key] as string).length > (key === 'notes' ? 10000 : 1000)
    )
      throw new Error('A workout field is missing or too long.');
  if (!(fields.plannedWorkout as string).trim())
    throw new Error('Add a planned workout description.');
  if (
    fields.actualDistance !== null &&
    (typeof fields.actualDistance !== 'number' ||
      !Number.isFinite(fields.actualDistance) ||
      fields.actualDistance < 0 ||
      fields.actualDistance > 1000)
  )
    throw new Error(
      'Distance must be between 0 and 1,000 miles, or left blank.',
    );
  if (
    fields.effort !== null &&
    (typeof fields.effort !== 'number' ||
      !Number.isInteger(fields.effort) ||
      fields.effort < 1 ||
      fields.effort > 10)
  )
    throw new Error(
      'Effort must be a whole number from 1 to 10, or left blank.',
    );
  return {
    date: fields.date as string,
    phase: fields.phase as string,
    type: fields.type as string,
    plannedWorkout: (fields.plannedWorkout as string).trim(),
    targetPace: fields.targetPace as string,
    done: fields.done as boolean,
    actualDistance: fields.actualDistance as number | null,
    actualPace: fields.actualPace as string,
    effort: fields.effort as number | null,
    pain: fields.pain as string,
    notes: fields.notes as string,
    version: fields.version as number,
  };
}

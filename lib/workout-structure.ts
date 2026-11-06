import { z } from 'zod';
import type { Workout } from './domain.ts';
import { formatPace, type DistanceUnit } from './workout-form.ts';

const positive = z.number().finite().positive();
const Step = z.object({
  kind: z.enum(['warmup', 'run', 'recovery', 'cooldown', 'race']),
  label: z.string().trim().min(1).max(160),
  durationSeconds: positive.int().max(86400),
  distanceMiles: positive.max(100).nullable(),
  paceSecondsPerMile: positive.max(86400).nullable(),
  effort: z.enum(['easy', 'steady', 'hard', 'race']),
}).strict();
const Structure = z.object({
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(350),
  steps: z.array(Step).min(1).max(12),
}).strict();
export type WorkoutStructure = z.infer<typeof Structure>;

export function validateWorkoutStructure(value: unknown): WorkoutStructure {
  const result = Structure.safeParse(value);
  if (!result.success) throw new Error('Check the workout steps, title and coaching note.');
  const structure = result.data;
  if (structure.steps.filter(step => step.kind === 'race').length > 1 || sessionDuration(structure) > 604800)
    throw new Error('Check the workout steps and total duration.');
  for (const step of structure.steps) {
    if (step.distanceMiles !== null && step.paceSecondsPerMile !== null &&
        Math.abs(step.distanceMiles * step.paceSecondsPerMile - step.durationSeconds) > Math.max(2, step.durationSeconds * .01))
      throw new Error('A workout step has inconsistent distance, duration and pace.');
  }
  return structure;
}
export function sessionDuration(structure: WorkoutStructure) {
  return structure.steps.reduce((sum, step) => sum + step.durationSeconds, 0);
}
export function structureMeasurements(structure: WorkoutStructure) {
  // Preserve the existing race-only completion target. The UI also shows the
  // complete session total, including warm-up and cool-down, separately.
  const race = structure.steps.find(step => step.kind === 'race');
  const fullDistance = structure.steps.every(step => step.distanceMiles !== null)
    ? structure.steps.reduce((sum, step) => sum + step.distanceMiles!, 0) : null;
  const distance = race ? race.distanceMiles : fullDistance;
  const duration = race ? race.durationSeconds : sessionDuration(structure);
  return { plannedDistance: distance, plannedDurationSeconds: duration,
    plannedPaceSecondsPerMile: race?.paceSecondsPerMile ?? (fullDistance !== null ? duration / fullDistance : structure.steps.length === 1 ? structure.steps[0].paceSecondsPerMile : null),
    targetMetric: race ? 'distance' as const : 'duration' as const };
}
export function editWorkoutStep(structure: WorkoutStructure, index: number, field: 'duration' | 'pace', value: number): WorkoutStructure {
  return { ...structure, steps: structure.steps.map((step, i) => {
    if (i !== index) return step;
    const duration = field === 'duration' ? value : step.durationSeconds;
    if (step.kind === 'race') return { ...step, durationSeconds: duration, paceSecondsPerMile: step.distanceMiles === null ? null : duration / step.distanceMiles };
    const pace = field === 'pace' ? value : step.paceSecondsPerMile;
    return { ...step, durationSeconds: duration, paceSecondsPerMile: pace, distanceMiles: pace === null ? null : duration / pace };
  }) };
}

// This is an exact compatibility check, never a parser or historical backfill.
// Only unmodified generated prescriptions may use their retained source steps.
function originalDescription(structure: WorkoutStructure) {
  return [structure.title, ...structure.steps.map(step => `${step.label}: ${step.durationSeconds}s, ${step.effort}${step.distanceMiles === null ? '' : `, ${Number(step.distanceMiles.toFixed(3))} mi`}${step.paceSecondsPerMile === null ? '' : `, ${Number(step.paceSecondsPerMile.toFixed(1))} s/mi`}`), structure.notes].filter(Boolean).join('\n');
}
export function workoutStructure(workout: Pick<Workout, 'planStructure' | 'originalSource' | 'plannedWorkout' | 'plannedDistance' | 'plannedDurationSeconds' | 'plannedPaceSecondsPerMile' | 'type'>): WorkoutStructure | null {
  if (workout.planStructure) return workout.planStructure;
  const source = workout.originalSource?.session;
  if (!source || typeof source !== 'object') return null;
  const session = source as Record<string, unknown>;
  try {
    const structure = validateWorkoutStructure({ title: session.title, notes: session.notes, steps: session.steps });
    const measurements = structureMeasurements(structure);
    if (session.type !== workout.type || originalDescription(structure) !== workout.plannedWorkout ||
        measurements.plannedDistance !== workout.plannedDistance || measurements.plannedDurationSeconds !== workout.plannedDurationSeconds ||
        measurements.plannedPaceSecondsPerMile !== workout.plannedPaceSecondsPerMile) return null;
    return structure;
  } catch { return null; }
}
export function readableDuration(seconds: number) {
  const total = Math.round(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), rest = total % 60;
  return [hours ? `${hours} hr` : '', minutes ? `${minutes} min` : '', rest ? `${rest} sec` : ''].filter(Boolean).join(' ') || '0 sec';
}
export function readableDistance(miles: number, unit: DistanceUnit) {
  return `${(miles * (unit === 'km' ? 1.609344 : 1)).toFixed(2)} ${unit}`;
}
export function workoutSummary(workout: Workout) {
  const structure = workoutStructure(workout);
  const totals = structure ? structureMeasurements(structure) : workout;
  const duration = structure ? sessionDuration(structure) : totals.plannedDurationSeconds;
  const distance = structure && structure.steps.every(step => step.distanceMiles !== null)
    ? structure.steps.reduce((sum, step) => sum + step.distanceMiles!, 0) : totals.plannedDistance;
  const title = structure?.title ?? workout.plannedWorkout.split('\n')[0];
  return [title.length > 120 ? title.slice(0, 117) + '…' : title, duration == null ? '' : readableDuration(duration), distance == null ? '' : readableDistance(distance, 'mi')].filter(Boolean).join(' · ');
}
export function stepPace(step: WorkoutStructure['steps'][number], unit: DistanceUnit) {
  return step.paceSecondsPerMile === null ? 'Follow effort' : `${formatPace(step.paceSecondsPerMile, unit)} /${unit}`;
}

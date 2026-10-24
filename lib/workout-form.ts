import type { Workout } from './domain.ts';

export type DistanceUnit = 'mi' | 'km';
export type PlanField = 'distance' | 'pace' | 'duration';
export type InputKind = PlanField | 'actualDistance' | 'actualPace' | 'actualDuration' | 'effort';
export const KM_PER_MILE = 1.609344;
export const PLAN_FIELDS: PlanField[] = ['distance', 'pace', 'duration'];

export function formatDistance(miles: number | null, unit: DistanceUnit) {
  return miles === null ? '' : String(Number((miles * (unit === 'km' ? KM_PER_MILE : 1)).toFixed(4)));
}
export function formatDuration(seconds: number | null) {
  if (seconds === null) return '';
  const total = Math.round(seconds), minutes = Math.floor(total / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export function formatPace(secondsPerMile: number | null, unit: DistanceUnit) {
  if (secondsPerMile === null) return '';
  const seconds = Math.round(secondsPerMile / (unit === 'km' ? KM_PER_MILE : 1));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Parsing is strict and never strips words or units into an accidental number.
export function parseInput(text: string, kind: InputKind, unit: DistanceUnit): number | null {
  if (!text) return null;
  if (kind === 'distance' || kind === 'actualDistance') {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
    const miles = Number(text) / (unit === 'km' ? KM_PER_MILE : 1);
    return miles <= 1000 && (kind === 'actualDistance' ? miles >= 0 : miles > 0) ? miles : null;
  }
  if (kind === 'effort') return /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= 10 ? Number(text) : null;
  const pace = kind === 'pace' || kind === 'actualPace';
  const pattern = pace ? /^\d{1,3}:[0-5]\d$/ : /^\d{1,3}:[0-5]\d:[0-5]\d$/;
  if (!pattern.test(text)) return null;
  const seconds = text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  if (pace) {
    const canonical = seconds * (unit === 'km' ? KM_PER_MILE : 1);
    return canonical > 0 && canonical <= 86400 ? canonical : null;
  }
  return seconds <= 604800 && (kind === 'actualDuration' ? seconds >= 0 : seconds > 0) ? seconds : null;
}

export function inputFeedback(text: string, kind: InputKind, unit: DistanceUnit, strict: boolean): { state: 'error' | 'hint'; message: string } | null {
  if (text === '' || parseInput(text, kind, unit) !== null) return null;
  if (kind === 'effort') return { state: 'error', message: 'Enter a whole number from 1 to 10.' };
  if (kind === 'distance' || kind === 'actualDistance') {
    if (/^\d+\.$/.test(text) && !strict) return { state: 'hint', message: 'Finish the decimal, such as 5.5.' };
    return { state: 'error', message: `${kind === 'distance' ? 'Use a number greater than zero' : 'Use zero or a positive number'}, up to ${formatDistance(1000, unit)} ${unit}.` };
  }
  const pace = kind === 'pace' || kind === 'actualPace';
  if (text.split(':').slice(1).some(part => Number(part) >= 60))
    return { state: 'error', message: pace ? 'Seconds must be 00–59. Try 12:45.' : 'Minutes and seconds must be 00–59.' };
  const partial = pace ? /^\d{0,3}(:\d{0,2})?$/ : /^\d{0,3}(:\d{0,2}){0,2}$/;
  const isFull = pace ? /^\d{1,3}:\d{2}$/ : /^\d{1,3}:\d{2}:\d{2}$/;
  return { state: !strict && partial.test(text) && !isFull.test(text) ? 'hint' : 'error', message: pace ? 'Use mm:ss, greater than zero, such as 12:00.' : `Use h:mm:ss${kind === 'duration' ? ', greater than zero' : ''}, up to 168:00:00.` };
}

export type LinkedPlan = {
  text: Record<PlanField, string>;
  exact: Record<PlanField, number | null>;
  recent: PlanField[];
  calculated: PlanField | null;
  targetMetric: 'distance' | 'duration' | null;
};
export function initialLinkedPlan(workout: Workout): LinkedPlan {
  return {
    text: { distance: formatDistance(workout.plannedDistance, 'mi'), pace: formatPace(workout.plannedPaceSecondsPerMile, 'mi'), duration: formatDuration(workout.plannedDurationSeconds) },
    exact: { distance: workout.plannedDistance, pace: workout.plannedPaceSecondsPerMile, duration: workout.plannedDurationSeconds },
    recent: workout.targetMetric === 'duration' ? ['pace', 'duration'] : ['pace', 'distance'],
    calculated: null, targetMetric: workout.targetMetric,
  };
}
export function changePlanUnit(plan: LinkedPlan, unit: DistanceUnit): LinkedPlan {
  // Reformat valid fields from canonical values. Preserve incomplete/invalid
  // edits so changing units cannot silently repair or discard user input.
  return { ...plan, text: { ...plan.text,
    distance: plan.exact.distance === null ? plan.text.distance : formatDistance(plan.exact.distance, unit),
    pace: plan.exact.pace === null ? plan.text.pace : formatPace(plan.exact.pace, unit),
  } };
}
export function editLinkedPlan(plan: LinkedPlan, edited: PlanField, value: string, unit: DistanceUnit, running: boolean): LinkedPlan {
  const next: LinkedPlan = { ...plan, text: { ...plan.text, [edited]: value }, exact: { ...plan.exact, [edited]: parseInput(value, edited, unit) } };
  if (!running || next.exact[edited] === null || PLAN_FIELDS.some(key => next.text[key] !== '' && parseInput(next.text[key], key, unit) === null)) return next;
  const recent = [...plan.recent.filter(key => key !== edited && next.exact[key] !== null), edited].slice(-2);
  if (recent.length < 2) {
    const other = PLAN_FIELDS.find(key => key !== edited && key !== plan.calculated && next.exact[key] !== null);
    if (other) recent.unshift(other);
  }
  next.recent = recent;
  if (recent.length !== 2) return next;
  const calculated = PLAN_FIELDS.find(key => !recent.includes(key))!;
  const { distance, pace, duration } = next.exact;
  const result = calculated === 'duration' ? distance! * pace! : calculated === 'pace' ? duration! / distance! : duration! / pace!;
  if (!(result > 0 && Number.isFinite(result))) return next;
  next.calculated = calculated;
  next.exact[calculated] = calculated === 'duration' ? Math.round(result) : result;
  next.text[calculated] = calculated === 'distance' ? formatDistance(result, unit) : calculated === 'pace' ? formatPace(result, unit) : formatDuration(result);
  // Once chosen, editing or recalculating another field does not flip a saved
  // workout's completion criterion. New time-led workouts keep a time target.
  if (next.targetMetric === null) next.targetMetric = calculated === 'distance' ? 'duration' : 'distance';
  return next;
}

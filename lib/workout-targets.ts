// Provider-independent shared contract. Distance is stored in miles to match
// actualDistance; forms and generators convert display units at their boundary.
export type WorkoutMeasurements = {
  plannedDistance: number | null;
  plannedDurationSeconds: number | null;
  actualDurationSeconds: number | null;
  targetMetric: 'distance' | 'duration' | null;
  // Canonical seconds per mile, allowing fractions for lossless km conversion.
  plannedPaceSecondsPerMile: number | null;
  actualPaceSecondsPerMile: number | null;
};

export const EMPTY_WORKOUT_MEASUREMENTS: WorkoutMeasurements = {
  plannedDistance: null,
  plannedDurationSeconds: null,
  actualDurationSeconds: null,
  targetMetric: null,
  plannedPaceSecondsPerMile: null,
  actualPaceSecondsPerMile: null,
};

const plannedKeys = ['plannedDistance', 'plannedDurationSeconds', 'targetMetric'] as const;
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function measurement(value: unknown, label: string, maximum: number, whole: boolean, allowZero: boolean): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || value > maximum || (whole && !Number.isSafeInteger(value)))
    throw new Error(`${label} must be ${whole ? 'a whole number' : 'a number'} ${allowZero ? 'at least zero' : 'greater than zero'}, within the supported limit, or left blank.`);
  return value;
}

// Old clients omit these fields. Keep omissions absent so legacy PATCH requests
// cannot erase measurements saved by a newer form or the plan generator.
export function validateWorkoutMeasurements(input: Record<string, unknown>): Partial<WorkoutMeasurements> {
  const result: Partial<WorkoutMeasurements> = {};
  if (plannedKeys.some(key => owns(input, key))) {
    if (!plannedKeys.every(key => owns(input, key)))
      throw new Error('Send plannedDistance, plannedDurationSeconds, and targetMetric together.');
    const distance = measurement(input.plannedDistance, 'Planned distance in miles', 1000, false, false);
    const duration = measurement(input.plannedDurationSeconds, 'Planned duration in seconds', 604800, true, false);
    const metric = input.targetMetric;
    if (metric !== null && metric !== 'distance' && metric !== 'duration')
      throw new Error('Choose distance or duration as the workout target metric, or leave it blank.');
    if ((metric === 'distance' && distance === null) || (metric === 'duration' && duration === null))
      throw new Error('The selected target metric needs a planned value.');
    if (metric === null && (distance !== null || duration !== null))
      throw new Error('Choose the target metric for the planned measurements.');
    Object.assign(result, { plannedDistance: distance, plannedDurationSeconds: duration, targetMetric: metric });
  }
  if (owns(input, 'actualDurationSeconds'))
    result.actualDurationSeconds = measurement(input.actualDurationSeconds, 'Actual duration in seconds', 604800, true, true);
  for (const key of ['plannedPaceSecondsPerMile', 'actualPaceSecondsPerMile'] as const)
    if (owns(input, key)) result[key] = measurement(input[key], 'Pace in seconds per mile', 86400, false, false);
  return result;
}

export type RestDay = {
  id: string;
  planId: string;
  date: string;
  version: number;
  updatedAt: string;
};

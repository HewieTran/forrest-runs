// Provider-independent result provenance. Values are set by the server, never
// trusted from a submitted checkbox or a client-supplied source marker.
export const RESULT_FIELDS = ['actualDistance', 'actualDurationSeconds', 'actualPaceSecondsPerMile'] as const;
export type ResultField = typeof RESULT_FIELDS[number];
export type ResultOrigins = Partial<Record<ResultField, number>>;
type Measurements = { type: string; done: boolean; actualPace: string; actualDistance: number | null;
  actualDurationSeconds?: number | null; actualPaceSecondsPerMile?: number | null;
  plannedDistance?: number | null; plannedDurationSeconds?: number | null; plannedPaceSecondsPerMile?: number | null;
  resultOrigins?: ResultOrigins | null };

export function validateResultOrigins(value: unknown): ResultOrigins | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid copied-result metadata.');
  const result: ResultOrigins = {};
  for (const [key, number] of Object.entries(value)) {
    if (!RESULT_FIELDS.includes(key as ResultField) || typeof number !== 'number' || !Number.isFinite(number) || number < 0 || (key === 'actualDurationSeconds' && !Number.isSafeInteger(number)))
      throw new Error('Invalid copied-result metadata.');
    result[key as ResultField] = number;
  }
  return Object.keys(result).length ? result : null;
}

export function applyCompletion<T extends Measurements>(before: T, input: Partial<T>, manualFields: readonly ResultField[] = []) {
  const next = { ...before, ...input };
  const origins = { ...(before.resultOrigins ?? {}) };
  for (const key of RESULT_FIELDS) {
    if (manualFields.includes(key) || (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== before[key])) delete origins[key];
  }
  if (next.done !== before.done) {
    if (next.done) {
      const running = next.type !== 'Strength' && next.type !== 'Mobility';
      let distance = next.plannedDistance ?? null, duration = next.plannedDurationSeconds ?? null, pace = next.plannedPaceSecondsPerMile ?? null;
      if (running) {
        if (distance === null && duration !== null && pace !== null) distance = duration / pace;
        if (duration === null && distance !== null && pace !== null) duration = Math.round(distance * pace);
        if (pace === null && distance !== null && distance > 0 && duration !== null) pace = duration / distance;
      }
      const planned = { actualDistance: running ? distance : null, actualDurationSeconds: duration,
        actualPaceSecondsPerMile: running && !next.actualPace.trim() ? pace : null };
      for (const key of RESULT_FIELDS) {
        const value = planned[key];
        if (next[key] == null && value !== null && Number.isFinite(value) && value > 0) {
          (next as Measurements)[key] = value;
          origins[key] = value;
        }
      }
    } else {
      for (const key of RESULT_FIELDS) {
        if (origins[key] !== undefined && next[key] === origins[key]) (next as Measurements)[key] = null;
        delete origins[key];
      }
    }
  }
  return { ...next, resultOrigins: Object.keys(origins).length ? origins : null };
}

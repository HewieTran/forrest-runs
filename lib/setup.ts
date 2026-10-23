import { validDate } from './domain.ts';

export const RESULT_DISTANCES = ['5k', '10k', 'half'] as const;
export const RESULT_LABELS = { '5k': '5K', '10k': '10K', half: 'Half marathon' };
export const SETUP_STEPS = ['Goal', 'Runner', 'Starting fitness', 'Availability', 'Review'] as const;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export type ResultDistance = typeof RESULT_DISTANCES[number];
export type PerformanceResult = { time: string; date: string; source: 'race' | 'time-trial' };
export type BlockSetup = {
  schemaVersion: 1;
  step: number;
  units: 'mi' | 'km';
  runner: {
    age: number | null; weight: number | null; height: number | null;
    vo2: { value: number | null; source: string; date: string } | null;
  };
  baseline: {
    weeklyDistance: number | null; longestRun: number | null; runsPerWeek: number | null;
    results: Record<ResultDistance, PerformanceResult>;
  };
  goal: { name: string; distanceKm: number | null; targetTime: string; startDate: string; targetDate: string };
  availability: { days: number[]; longRunDay: number | null };
};
export type SetupIssue = { step: number; field: string; message: string };

export function emptySetup(name = '', targetDate = ''): BlockSetup {
  return {
    schemaVersion: 1, step: 0, units: 'mi',
    runner: { age: null, weight: null, height: null, vo2: null },
    baseline: { weeklyDistance: null, longestRun: null, runsPerWeek: null,
      results: { '5k': { time: '', date: '', source: 'race' }, '10k': { time: '', date: '', source: 'race' }, half: { time: '', date: '', source: 'race' } } },
    goal: { name, distanceKm: null, targetTime: '', startDate: '', targetDate },
    availability: { days: [], longRunDay: null },
  };
}
export function durationSeconds(value: string): number | null {
  if (!/^(?:\d{1,3}:)?\d{1,2}:\d{2}$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  const seconds = parts.at(-1)!, minutes = parts.at(-2)!;
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) return null;
  const total = seconds + minutes * 60 + (parts.length === 3 ? parts[0] * 3600 : 0);
  return total > 0 ? total : null;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The setup is incomplete or invalid.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, limit = 120): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`Check ${label}.`);
  return value.trim();
}
function numeric(value: unknown, label: string, allowZero = false, whole = false): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || (whole && !Number.isSafeInteger(value)))
    throw new Error(`Enter a ${allowZero ? 'non-negative' : 'positive'}${whole ? ' whole' : ''} number for ${label}.`);
  return value;
}
function date(value: unknown, label: string, today?: string): string {
  const result = text(value, label, 10);
  if (result && (!validDate(result) || (today && result > today))) throw new Error(`Enter a valid ${label}${today ? ' on or before today' : ''}.`);
  return result;
}
function time(value: unknown, label: string): string {
  const result = text(value, label, 20);
  if (result && durationSeconds(result) === null) throw new Error(`Use m:ss or h:mm:ss for ${label}, greater than zero.`);
  return result;
}

// Save incomplete drafts, but reject invalid supplied values. No feasibility or
// training prescriptions are inferred from a successfully saved setup.
export function validateSetup(value: unknown, today?: string): BlockSetup {
  const input = record(value), runner = record(input.runner), baseline = record(input.baseline);
  const goal = record(input.goal), availability = record(input.availability), results = record(baseline.results);
  if (input.schemaVersion !== 1 || !Number.isInteger(input.step) || Number(input.step) < 0 || Number(input.step) > 4 || !['mi', 'km'].includes(String(input.units)))
    throw new Error('Reload this setup before saving.');
  const normalized = emptySetup();
  normalized.step = input.step as number;
  normalized.units = input.units as 'mi' | 'km';
  normalized.runner = { age: numeric(runner.age, 'age', false, true), weight: numeric(runner.weight, 'weight'), height: numeric(runner.height, 'height'), vo2: null };
  if (runner.vo2 !== null) {
    const vo2 = record(runner.vo2);
    normalized.runner.vo2 = { value: numeric(vo2.value, 'VO₂ max'), source: text(vo2.source, 'VO₂ source'), date: date(vo2.date, 'VO₂ measurement date', today) };
  }
  normalized.baseline.weeklyDistance = numeric(baseline.weeklyDistance, 'weekly distance', true);
  normalized.baseline.longestRun = numeric(baseline.longestRun, 'longest recent run', true);
  normalized.baseline.runsPerWeek = numeric(baseline.runsPerWeek, 'current runs per week', true, true);
  if (normalized.baseline.runsPerWeek !== null && normalized.baseline.runsPerWeek > 7) throw new Error('Current running days must be between 0 and 7.');
  for (const key of RESULT_DISTANCES) {
    const result = record(results[key]);
    if (result.source !== 'race' && result.source !== 'time-trial') throw new Error('Choose race or time trial for each performance result.');
    normalized.baseline.results[key] = { time: time(result.time, `${RESULT_LABELS[key]} result`), date: date(result.date, `${RESULT_LABELS[key]} result date`, today), source: result.source };
  }
  normalized.goal = { name: text(goal.name, 'block name'), distanceKm: numeric(goal.distanceKm, 'goal distance'), targetTime: time(goal.targetTime, 'target finish time'), startDate: date(goal.startDate, 'start date'), targetDate: date(goal.targetDate, 'target date') };
  if (normalized.goal.startDate && normalized.goal.targetDate && normalized.goal.targetDate <= normalized.goal.startDate) throw new Error('The target date must come after the training start date.');
  if (!Array.isArray(availability.days) || availability.days.length > 7 || availability.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(availability.days).size !== availability.days.length)
    throw new Error('Choose each available training day once.');
  normalized.availability.days = [...availability.days].sort((a, b) => a - b);
  const longDay = availability.longRunDay;
  if (longDay !== null && (!Number.isInteger(longDay) || Number(longDay) < 0 || Number(longDay) > 6 || !normalized.availability.days.includes(longDay as number)))
    throw new Error('Choose a long-run day from your available training days.');
  normalized.availability.longRunDay = longDay as number | null;
  return normalized;
}

export function setupIssues(setup: BlockSetup): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const need = (condition: boolean, step: number, field: string, message: string) => { if (condition) issues.push({ step, field, message }); };
  need(!setup.goal.name, 0, 'name', 'Add a block name.');
  need(!setup.goal.distanceKm, 0, 'distanceKm', 'Choose a goal distance.');
  need(!setup.goal.targetTime, 0, 'targetTime', 'Add a target finish time.');
  need(!setup.goal.startDate, 0, 'startDate', 'Choose a training start date.');
  need(!setup.goal.targetDate, 0, 'targetDate', 'Choose a target date.');
  for (const field of ['age', 'weight', 'height'] as const) need(setup.runner[field] === null, 1, field, `Add your ${field}.`);
  const vo2 = setup.runner.vo2;
  need(!!vo2 && (vo2.value === null || !vo2.source || !vo2.date), 1, 'vo2', 'Complete the optional VO₂ fields or leave VO₂ max off.');
  need(setup.baseline.weeklyDistance === null, 2, 'weeklyDistance', 'Add current weekly running distance, or 0 if not running.');
  need(setup.baseline.longestRun === null, 2, 'longestRun', 'Add your longest recent run, or 0 if none.');
  need(setup.baseline.runsPerWeek === null, 2, 'runsPerWeek', 'Add your current running days per week.');
  need(!RESULT_DISTANCES.some(key => setup.baseline.results[key].time && setup.baseline.results[key].date), 2, 'results', 'Add at least one dated 5K, 10K, or half-marathon best effort. VO₂ max does not replace a result.');
  for (const key of RESULT_DISTANCES) { const result = setup.baseline.results[key]; need(!!result.time !== !!result.date, 2, key, `Add both the ${RESULT_LABELS[key]} result and its date, or leave both blank.`); }
  need(setup.availability.days.length === 0, 3, 'days', 'Choose at least one available running day.');
  need(setup.availability.longRunDay === null, 3, 'longRunDay', 'Choose a preferred long-run day.');
  return issues;
}

export function convertSetupUnits(setup: BlockSetup, units: 'mi' | 'km'): BlockSetup {
  if (setup.units === units) return setup;
  const fromMiles = units === 'km';
  const convert = (value: number | null, factor: number) => value === null ? null : Math.round(value * factor * 10000) / 10000;
  return { ...setup, units,
    runner: { ...setup.runner, weight: convert(setup.runner.weight, fromMiles ? 0.45359237 : 1 / 0.45359237), height: convert(setup.runner.height, fromMiles ? 2.54 : 1 / 2.54) },
    baseline: { ...setup.baseline, weeklyDistance: convert(setup.baseline.weeklyDistance, fromMiles ? 1.609344 : 1 / 1.609344), longestRun: convert(setup.baseline.longestRun, fromMiles ? 1.609344 : 1 / 1.609344) },
  };
}

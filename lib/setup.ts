import { validDate } from './domain.ts';
import { parseInput, KM_PER_MILE } from './workout-form.ts';

export const RESULT_DISTANCES = ['5k', '10k', 'half'] as const;
export const RESULT_LABELS = { '5k': '5K', '10k': '10K', half: 'Half marathon' };
export const SETUP_STEPS = ['Goal', 'Runner', 'Starting fitness', 'Availability', 'Review'] as const;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export type ResultDistance = typeof RESULT_DISTANCES[number];
export type PerformanceResult = { time: string; date: string; source: 'race' | 'time-trial' };

// Keep the original shape readable/exportable. Reading a saved snapshot never
// fills missing answers or writes an upgrade back to the database.
export type LegacyBlockSetup = {
  schemaVersion: 1;
  step: number;
  units: 'mi' | 'km';
  runner: { age: number | null; weight: number | null; height: number | null; vo2: { value: number | null; source: string; date: string } | null };
  baseline: { weeklyDistance: number | null; longestRun: number | null; runsPerWeek: number | null; results: Record<ResultDistance, PerformanceResult> };
  goal: { name: string; distanceKm: number | null; targetTime: string; startDate: string; targetDate: string };
  availability: { days: number[]; longRunDay: number | null };
};
export type IntakeSetup = Omit<LegacyBlockSetup, 'schemaVersion' | 'runner' | 'goal' | 'baseline' | 'availability'> & {
  schemaVersion: 2;
  runner: LegacyBlockSetup['runner'] & { experience: 'novice' | 'intermediate' | 'advanced' | null };
  goal: LegacyBlockSetup['goal'] & { mode: 'finish' | 'time'; paceGuidance: 'effort' | 'performance' };
  baseline: LegacyBlockSetup['baseline'] & { trainingChanges: 'none' | 'changed' | 'unsure' | null; trainingChangesNotes: string };
  availability: LegacyBlockSetup['availability'] & { maxSessionDurationSeconds: number | null; dayDurationLimits: Record<string, number>; otherCommitments: string };
};
export type BlockSetup = LegacyBlockSetup | IntakeSetup;
export type SetupIssue = { step: number; field: string; message: string };

export function emptySetup(name = '', targetDate = '', startDate = ''): IntakeSetup {
  return {
    schemaVersion: 2, step: 0, units: 'mi',
    runner: { age: null, weight: null, height: null, vo2: null, experience: null },
    baseline: { weeklyDistance: null, longestRun: null, runsPerWeek: null,
      results: { '5k': { time: '', date: '', source: 'race' }, '10k': { time: '', date: '', source: 'race' }, half: { time: '', date: '', source: 'race' } },
      trainingChanges: null, trainingChangesNotes: '' },
    goal: { name, distanceKm: 5, targetTime: '', startDate, targetDate, mode: 'finish', paceGuidance: 'effort' },
    availability: { days: [], longRunDay: null, maxSessionDurationSeconds: null, dayDurationLimits: {}, otherCommitments: '' },
  };
}

// Only an editable view is upgraded. New answers remain unknown until supplied.
export function setupForEditing(setup: BlockSetup): IntakeSetup {
  if (setup.schemaVersion === 2) return structuredClone(setup);
  const result = emptySetup();
  return { ...result, step: setup.step, units: setup.units,
    runner: { ...result.runner, ...setup.runner },
    goal: { ...result.goal, ...setup.goal, mode: setup.goal.targetTime ? 'time' : 'finish', paceGuidance: setup.goal.targetTime ? 'performance' : 'effort' },
    baseline: { ...result.baseline, ...setup.baseline },
    availability: { ...result.availability, ...setup.availability },
  };
}

// Both setup and workout forms use the same duration parser. Setup also accepts
// m:ss as a convenience; stored session limits and planner inputs use seconds.
export function durationSeconds(value: string): number | null {
  const normalized = /^\d{1,2}:[0-5]\d$/.test(value) ? `0:${value.padStart(5, '0')}` : value;
  return parseInput(normalized, 'duration', 'mi');
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
function sessionLimit(value: unknown): number | null {
  const seconds = numeric(value, 'session time limit', false, true);
  if (seconds !== null && seconds > 86400) throw new Error('Session time limits cannot exceed 24 hours.');
  return seconds;
}

// Partial drafts may omit answers, but supplied values must be valid. Neither
// a complete setup nor passing validation is a fitness/safety assessment.
export function validateSetup(value: unknown, today?: string): BlockSetup {
  const input = record(value), runner = record(input.runner), baseline = record(input.baseline);
  const goal = record(input.goal), availability = record(input.availability), results = record(baseline.results);
  if (![1, 2].includes(input.schemaVersion as number) || !Number.isInteger(input.step) || Number(input.step) < 0 || Number(input.step) > 4 || !['mi', 'km'].includes(String(input.units)))
    throw new Error('Reload this setup before saving.');
  const normalized: LegacyBlockSetup = {
    schemaVersion: 1, step: input.step as number, units: input.units as 'mi' | 'km',
    runner: { age: numeric(runner.age, 'age', false, true), weight: numeric(runner.weight, 'weight'), height: numeric(runner.height, 'height'), vo2: null },
    baseline: { weeklyDistance: numeric(baseline.weeklyDistance, 'weekly distance', true), longestRun: numeric(baseline.longestRun, 'longest recent run', true), runsPerWeek: numeric(baseline.runsPerWeek, 'current runs per week', true, true), results: {} as Record<ResultDistance, PerformanceResult> },
    goal: { name: text(goal.name, 'block name'), distanceKm: numeric(goal.distanceKm, 'goal distance'), targetTime: time(goal.targetTime, 'target finish time'), startDate: date(goal.startDate, 'start date'), targetDate: date(goal.targetDate, 'target date') },
    availability: { days: [], longRunDay: null },
  };
  if (runner.vo2 !== null) {
    const vo2 = record(runner.vo2);
    normalized.runner.vo2 = { value: numeric(vo2.value, 'VO₂ max'), source: text(vo2.source, 'VO₂ source'), date: date(vo2.date, 'VO₂ measurement date', today) };
  }
  if (normalized.baseline.runsPerWeek !== null && normalized.baseline.runsPerWeek > 7) throw new Error('Current running days must be between 0 and 7.');
  for (const key of RESULT_DISTANCES) {
    const result = record(results[key]);
    if (result.source !== 'race' && result.source !== 'time-trial') throw new Error('Choose race or time trial for each performance result.');
    normalized.baseline.results[key] = { time: time(result.time, `${RESULT_LABELS[key]} result`), date: date(result.date, `${RESULT_LABELS[key]} result date`, today), source: result.source };
  }
  if (normalized.goal.startDate && normalized.goal.targetDate && normalized.goal.targetDate <= normalized.goal.startDate) throw new Error('The target date must come after the training start date.');
  if (!Array.isArray(availability.days) || availability.days.length > 7 || availability.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(availability.days).size !== availability.days.length)
    throw new Error('Choose each training day once.');
  normalized.availability.days = [...availability.days].sort((a, b) => a - b);
  const longDay = availability.longRunDay;
  if (longDay !== null && (!Number.isInteger(longDay) || Number(longDay) < 0 || Number(longDay) > 6 || !normalized.availability.days.includes(longDay as number)))
    throw new Error('Choose a long-run day from your selected training days.');
  normalized.availability.longRunDay = longDay as number | null;
  if (input.schemaVersion === 1) return normalized;

  const updated = setupForEditing(normalized);
  if (!['finish', 'time'].includes(String(goal.mode)) || !['effort', 'performance'].includes(String(goal.paceGuidance))) throw new Error('Choose your goal and pace guidance.');
  if (runner.experience !== null && !['novice', 'intermediate', 'advanced'].includes(String(runner.experience))) throw new Error('Choose a running experience level or leave it blank.');
  if (baseline.trainingChanges !== null && !['none', 'changed', 'unsure'].includes(String(baseline.trainingChanges))) throw new Error('Choose whether anything has interrupted or limited your training.');
  updated.goal.mode = goal.mode as IntakeSetup['goal']['mode'];
  updated.goal.paceGuidance = goal.paceGuidance as IntakeSetup['goal']['paceGuidance'];
  updated.runner.experience = runner.experience as IntakeSetup['runner']['experience'];
  updated.baseline.trainingChanges = baseline.trainingChanges as IntakeSetup['baseline']['trainingChanges'];
  updated.baseline.trainingChangesNotes = text(baseline.trainingChangesNotes, 'training changes', 1000);
  updated.availability.maxSessionDurationSeconds = sessionLimit(availability.maxSessionDurationSeconds);
  const limits = record(availability.dayDurationLimits);
  updated.availability.dayDurationLimits = {};
  for (const [day, limit] of Object.entries(limits)) {
    if (!/^[0-6]$/.test(day) || !updated.availability.days.includes(Number(day))) throw new Error('Set time overrides only for selected training days.');
    const seconds = sessionLimit(limit);
    if (seconds === null) throw new Error('Enter a time override or remove it.');
    updated.availability.dayDurationLimits[day] = seconds;
  }
  updated.availability.otherCommitments = text(availability.otherCommitments, 'other exercise commitments', 1000);
  // Name is a convenience, not another mandatory question. Do not change legacy names.
  if (!updated.goal.name) updated.goal.name = suggestedBlockName(updated);
  return updated;
}

export function suggestedBlockName(setup: IntakeSetup) {
  const distance = setup.goal.distanceKm === 5 ? '5K' : setup.goal.distanceKm ? `${setup.goal.distanceKm} km` : 'Running';
  return `${distance} training${setup.goal.targetDate ? ` · ${setup.goal.targetDate}` : ''}`;
}

export function setupIssues(setup: BlockSetup): SetupIssue[] {
  const value = setupForEditing(setup), issues: SetupIssue[] = [];
  const need = (condition: boolean, step: number, field: string, message: string) => { if (condition) issues.push({ step, field, message }); };
  need(!value.goal.distanceKm, 0, 'goalKind', 'Choose a race distance.');
  need(value.goal.distanceKm !== null && value.goal.distanceKm !== 5, 0, 'goalKind', 'The first planner release supports 5K. Other race details can stay saved as a draft.');
  need(value.goal.mode === 'time' && !value.goal.targetTime, 0, 'targetTime', 'Add your target finish time, or choose Finish comfortably.');
  need(!value.goal.startDate, 0, 'startDate', 'Choose a training start date.');
  need(!value.goal.targetDate, 0, 'targetDate', 'Choose a race date.');
  const vo2 = value.runner.vo2;
  need(!!vo2 && (vo2.value === null || !vo2.source || !vo2.date), 1, 'vo2', 'Complete the optional VO₂ fields or leave VO₂ max off.');
  need(value.baseline.weeklyDistance === null, 2, 'weeklyDistance', 'Add average weekly distance over the last four weeks.');
  need(value.baseline.longestRun === null, 2, 'longestRun', 'Add your longest run in the last four weeks.');
  need(value.baseline.runsPerWeek === null, 2, 'runsPerWeek', 'Add your current running days per week.');
  need(value.baseline.trainingChanges === null, 2, 'trainingChanges', 'Tell us whether anything has interrupted or limited your training.');
  need(value.baseline.trainingChanges === 'changed' && !value.baseline.trainingChangesNotes, 2, 'trainingChangesNotes', 'Briefly describe the training change or limitation.');
  need(value.goal.paceGuidance === 'performance' && !RESULT_DISTANCES.some(key => value.baseline.results[key].time && value.baseline.results[key].date), 2, 'results', 'Add a dated race or time trial for performance-based paces, or choose effort guidance.');
  for (const key of RESULT_DISTANCES) {
    const result = value.baseline.results[key];
    need(!!result.time !== !!result.date, 2, key, `Add both the ${RESULT_LABELS[key]} result and its date, or remove the result.`);
  }
  need(value.availability.days.length === 0, 3, 'days', 'Choose the days you want scheduled.');
  need(value.availability.maxSessionDurationSeconds === null, 3, 'sessionLimit', 'Add a maximum time per session.');
  return issues;
}

export function convertSetupUnits<T extends BlockSetup>(setup: T, units: 'mi' | 'km'): T {
  if (setup.units === units) return setup;
  const fromMiles = units === 'km';
  const convert = (value: number | null, factor: number) => value === null ? null : Math.round(value * factor * 10000) / 10000;
  return { ...setup, units,
    runner: { ...setup.runner, weight: convert(setup.runner.weight, fromMiles ? 0.45359237 : 1 / 0.45359237), height: convert(setup.runner.height, fromMiles ? 2.54 : 1 / 2.54) },
    baseline: { ...setup.baseline, weeklyDistance: convert(setup.baseline.weeklyDistance, fromMiles ? KM_PER_MILE : 1 / KM_PER_MILE), longestRun: convert(setup.baseline.longestRun, fromMiles ? KM_PER_MILE : 1 / KM_PER_MILE) },
  };
}

// Provider-independent boundary for the next engine stage. Raw display strings
// are never passed as quantities; missing measurements remain null.
export function plannerIntake(setup: BlockSetup) {
  const value = setupForEditing(validateSetup(setup));
  if (setupIssues(value).length) throw new Error('Complete the required setup before preparing planner inputs.');
  const miles = (distance: number | null) => distance === null ? null : distance / (value.units === 'km' ? KM_PER_MILE : 1);
  return {
    schemaVersion: 1,
    goal: { distanceMeters: value.goal.distanceKm! * 1000, startDate: value.goal.startDate, raceDate: value.goal.targetDate, mode: value.goal.mode, targetDurationSeconds: value.goal.mode === 'time' ? durationSeconds(value.goal.targetTime) : null, paceGuidance: value.goal.paceGuidance },
    runner: { age: value.runner.age, heightCm: value.runner.height === null ? null : value.runner.height * (value.units === 'mi' ? 2.54 : 1), weightKg: value.runner.weight === null ? null : value.runner.weight * (value.units === 'mi' ? 0.45359237 : 1), experience: value.runner.experience, vo2: value.runner.vo2 },
    baseline: { weeklyDistanceMiles: miles(value.baseline.weeklyDistance), longestRunMiles: miles(value.baseline.longestRun), runsPerWeek: value.baseline.runsPerWeek, trainingChanges: value.baseline.trainingChanges, trainingChangesNotes: value.baseline.trainingChangesNotes,
      results: RESULT_DISTANCES.filter(key => value.baseline.results[key].time && value.baseline.results[key].date).map(key => ({ distanceMeters: { '5k': 5000, '10k': 10000, half: 21097.5 }[key], durationSeconds: durationSeconds(value.baseline.results[key].time), date: value.baseline.results[key].date, source: value.baseline.results[key].source })) },
    availability: { trainingDays: value.availability.days, maxSessionDurationSeconds: value.availability.maxSessionDurationSeconds, dayDurationLimits: value.availability.dayDurationLimits, longRunDay: value.availability.longRunDay, otherCommitments: value.availability.otherCommitments },
  };
}

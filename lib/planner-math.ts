import { z } from 'zod';
import { METERS_PER_MILE, raceForMeters } from './race-distance.ts';
import { PlanValidationError } from './plan-validation.ts';
import type { PlannerIntake, PlanOutput } from './planner.ts';

export const PLAN_CALCULATION_VERSION = 'duration-pace-v1' as const;
function raceMilesFor(input: PlannerIntake) {
  const race = raceForMeters(input.goal.distanceMeters);
  if (!race) throw new PlanValidationError('race');
  return race.meters / METERS_PER_MILE;
}
const seconds = z.number().finite().positive().int().max(86400);
const pace = z.number().finite().positive().max(86400).nullable();
const common = { label: z.string().trim().min(1).max(160), durationSeconds: seconds,
  effort: z.enum(['easy', 'steady', 'hard', 'race']) };
const RunningStep = z.object({ ...common, kind: z.enum(['warmup', 'run', 'recovery', 'cooldown']), paceSecondsPerMile: pace }).strict();
const RaceStep = z.object({ ...common, kind: z.literal('race'), paceSecondsPerMile: z.null() }).strict();
const WireOutput = z.object({ sessions: z.array(z.object({ steps: z.array(z.union([RunningStep, RaceStep])).min(1).max(12) }).passthrough()).max(183) }).passthrough();

// This is the new provider contract, not a repair of an old three-number plan.
// Unexpected distance fields or a model-supplied race pace are rejected.
export function calculatePlanMeasurements(value: unknown, input: PlannerIntake) {
  const raceMiles = raceMilesFor(input);
  const parsed = WireOutput.safeParse(value);
  if (!parsed.success) throw new PlanValidationError('output_shape');
  return { ...parsed.data, sessions: parsed.data.sessions.map(session => ({ ...session,
    steps: session.steps.map(step => step.kind === 'race'
      ? { ...step, distanceMiles: raceMiles, paceSecondsPerMile: input.goal.paceGuidance === 'effort' ? null : step.durationSeconds / raceMiles }
      : { ...step, distanceMiles: step.paceSecondsPerMile === null ? null : step.durationSeconds / step.paceSecondsPerMile }),
  })) };
}

// New snapshots preserve full precision. Historical snapshots keep the existing
// validator and tolerance; they are never recalculated when read or exported.
export function verifyCalculatedMeasurements(output: PlanOutput, input: PlannerIntake) {
  const raceMiles = raceMilesFor(input);
  const same = (actual: number | null, expected: number | null) => expected === null ? actual === null
    : actual !== null && Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12;
  for (const session of output.sessions) for (const step of session.steps) {
    const distance = step.kind === 'race' ? raceMiles : step.paceSecondsPerMile === null ? null : step.durationSeconds / step.paceSecondsPerMile;
    const racePace = input.goal.paceGuidance === 'effort' ? null : step.durationSeconds / raceMiles;
    if (!same(step.distanceMiles, distance) || (step.kind === 'race' && !same(step.paceSecondsPerMile, racePace)))
      throw new PlanValidationError('workout_arithmetic');
  }
}

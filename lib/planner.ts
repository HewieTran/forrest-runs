import { PLAN_CALCULATION_VERSION, verifyCalculatedMeasurements } from './planner-math.ts';
import { PlanValidationError, PLAN_VALIDATION_CODES, type PlanValidationCode } from './plan-validation.ts';
import { z } from 'zod';
import { METERS_PER_MILE, raceForMeters } from './race-distance.ts';
import { GoalAssessment, AssessmentContext, assessmentContext, type PlanningContext } from './plan-assessment.ts';
import { addDays, dateDiff, PHASES, validDate, type WorkoutInput } from './domain.ts';
import { plannerIntake, validateSetup, type BlockSetup } from './setup.ts';
import { workoutStructure } from './workout-structure.ts';
import { trainingWindowIssue } from './training-window.ts';

export const PLANNER_VERSION = 'race-v7-calculated';
export const PROMPT_VERSION = 'race-coach-v7-calculated';
export function requiresAssessment(version: string) { return ['5k-coach-v5-assessment', '5k-coach-v6-calculated', PROMPT_VERSION].includes(version); }
export type PlannerIntake = ReturnType<typeof plannerIntake>;
const number = z.number().finite().positive();
const Step = z.object({
  kind: z.enum(['warmup', 'run', 'recovery', 'cooldown', 'race']),
  label: z.string().trim().min(1).max(160),
  durationSeconds: number.int().max(86400),
  distanceMiles: number.max(100).nullable(),
  paceSecondsPerMile: number.max(86400).nullable(),
  effort: z.enum(['easy', 'steady', 'hard', 'race']),
}).strict();
const Session = z.object({
  date: z.string().refine(validDate),
  type: z.enum(['Easy Run', 'Quality Run', 'Long Run', 'Race']),
  phase: z.enum(PHASES),
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(350),
  steps: z.array(Step).min(1).max(12),
}).strict();
const Output = z.object({
  outcome: z.enum(['plan', 'needs_clarification']),
  summary: z.string().trim().min(1).max(1200),
  goalAssessment: z.string().trim().min(1).max(1200),
  assumptions: z.array(z.string().trim().min(1).max(400)).max(12),
  questions: z.array(z.string().trim().min(1).max(400)).max(8),
  sessions: z.array(Session).max(183),
  assessment: GoalAssessment.optional(), // Older saved plans remain readable.
}).strict();
export type PlanOutput = z.infer<typeof Output>;
export type PlanSession = PlanOutput['sessions'][number];
export type ScheduleDay = { date: string; kind: 'run' | 'race' | 'rest'; limitSeconds: number };

// Scope gates, not a medical or training-readiness assessment.
export function preparePlanner(setup: BlockSetup, today: string): PlannerIntake {
  if (setup.schemaVersion !== 4) throw new Error('Open your Runner setup and add a confirmed performance benchmark before generating a new plan.');
  const input = plannerIntake(validateSetup(setup, today));
  const windowIssue = trainingWindowIssue(input.goal.startDate, input.goal.raceDate, today);
  if (windowIssue) throw new Error(windowIssue.message);
  if (input.runner.age !== null && input.runner.age < 18) throw new Error('This first planner supports adult runners only.');
  if (input.baseline.longestRunMiles !== null && input.baseline.weeklyDistanceMiles !== null && input.baseline.longestRunMiles > input.baseline.weeklyDistanceMiles * 4 + 0.001) throw new Error('Your longest run exceeds the total distance reported for the last four weeks. Check your baseline.');
  return input;
}
export function scheduleDays(input: PlannerIntake): ScheduleDay[] {
  return Array.from({ length: dateDiff(input.goal.raceDate, input.goal.startDate) + 1 }, (_, i) => {
    const date = addDays(input.goal.startDate, i), day = new Date(date + 'T12:00:00Z').getUTCDay();
    return { date, kind: date === input.goal.raceDate ? 'race' : input.availability.trainingDays.includes(day) ? 'run' : 'rest',
      limitSeconds: input.availability.dayDurationLimits[String(day)] ?? input.availability.maxSessionDurationSeconds ?? 86400 };
  });
}
export function sessionSeconds(session: PlanSession) { return session.steps.reduce((sum, step) => sum + step.durationSeconds, 0); }
export function validatePlanOutput(value: unknown, input: PlannerIntake, requireAssessment = false): PlanOutput {
  const race = raceForMeters(input.goal.distanceMeters);
  if (!race) throw new PlanValidationError('race');
  const parsed = Output.safeParse(value);
  if (!parsed.success) throw new PlanValidationError('output_shape');
  const output = parsed.data;
  const assessment = output.assessment;
  if (requireAssessment && !assessment) throw new PlanValidationError('assessment');
  if (assessment) {
    const proceed = assessment.decision === 'proceed';
    if (proceed !== (output.outcome === 'plan') || (proceed ? assessment.actions.length !== 0 : assessment.actions.length === 0))
      throw new PlanValidationError('assessment');
    if (assessment.decision === 'adjust_goal' && !assessment.actions.some(action => action === 'target_time' || action === 'race_date'))
      throw new PlanValidationError('assessment');
    if (assessment.decision === 'refresh_benchmark' && !assessment.actions.includes('benchmark'))
      throw new PlanValidationError('assessment');
  }
  if (output.outcome === 'needs_clarification') {
    if (!output.questions.length || output.sessions.length) throw new PlanValidationError('assessment');
    return output;
  }
  if (output.questions.length) throw new PlanValidationError('assessment');
  const expected = scheduleDays(input).filter(day => day.kind !== 'rest');
  if (output.sessions.length !== expected.length) throw new PlanValidationError('schedule_completeness');
  const dates = new Set<string>();
  for (const session of output.sessions) {
    const day = expected.find(day => day.date === session.date);
    if (!day || dates.has(session.date)) throw new PlanValidationError('schedule_dates');
    dates.add(session.date);
    if (sessionSeconds(session) > day.limitSeconds) throw new PlanValidationError('session_limit');
    if ((day.kind === 'race') !== (session.type === 'Race')) throw new PlanValidationError('race');
    const raceSteps = session.steps.filter(step => step.kind === 'race');
    if (day.kind === 'race' ? raceSteps.length !== 1 || Math.abs((raceSteps[0].distanceMiles ?? 0) * METERS_PER_MILE - race.meters) > 1 : raceSteps.length !== 0)
      throw new PlanValidationError('race');
    if (session.type === 'Quality Run' && (!session.steps.some(step => step.kind === 'warmup') || !session.steps.some(step => step.kind === 'cooldown')))
      throw new PlanValidationError('warmup_cooldown');
    for (const step of session.steps) {
      if ((input.goal.paceGuidance === 'estimated' || input.schemaVersion === 2) && (step.paceSecondsPerMile === null || step.distanceMiles === null)) throw new PlanValidationError('numeric_targets');
      if (input.goal.paceGuidance === 'effort' && step.paceSecondsPerMile !== null) throw new PlanValidationError('numeric_targets');
      if (step.paceSecondsPerMile !== null && step.distanceMiles !== null && Math.abs(step.distanceMiles * step.paceSecondsPerMile - step.durationSeconds) > Math.max(2, step.durationSeconds * 0.01))
        throw new PlanValidationError('workout_arithmetic');
    }
    // Keep saved instructions within the shared workout text contract.
    if (workoutForSession(session).plannedWorkout.length > 1000) throw new PlanValidationError('workout_text');
  }
  return { ...output, sessions: output.sessions.sort((a, b) => a.date.localeCompare(b.date)) };
}
export function workoutForSession(session: PlanSession): WorkoutInput {
  const race = session.steps.find(step => step.kind === 'race');
  const fullDistance = session.steps.every(step => step.distanceMiles !== null) ? session.steps.reduce((sum, step) => sum + step.distanceMiles!, 0) : null;
  // Race measurements describe the race itself. Warm-up/cooldown remain in the
  // structured snapshot and instructions, and count toward the full-session cap.
  const distance = race ? race.distanceMiles : fullDistance;
  const seconds = race ? race.durationSeconds : sessionSeconds(session);
  return { date: session.date, type: session.type, phase: session.phase,
    planStructure: { title: session.title, notes: session.notes, steps: session.steps },
    plannedWorkout: [session.title, ...session.steps.map(step => `${step.label}: ${step.durationSeconds}s, ${step.effort}${step.distanceMiles === null ? '' : `, ${Number(step.distanceMiles.toFixed(3))} mi`}${step.paceSecondsPerMile === null ? '' : `, ${Number(step.paceSecondsPerMile.toFixed(1))} s/mi`}`), session.notes].filter(Boolean).join('\n'),
    targetPace: session.steps.every(step => step.paceSecondsPerMile !== null) ? 'Estimated numeric pace' : race ? race.effort : 'Follow segment effort guidance',
    plannedDistance: distance, plannedDurationSeconds: seconds,
    targetMetric: race ? 'distance' : 'duration',
    plannedPaceSecondsPerMile: race?.paceSecondsPerMile ?? (fullDistance !== null && fullDistance > 0 ? seconds / fullDistance : session.steps.length === 1 ? session.steps[0].paceSecondsPerMile : null),
    actualDurationSeconds: null, actualPaceSecondsPerMile: null, done: false,
    actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', version: 1 };
}
export const PLANNED_FIELDS = ['date', 'phase', 'type', 'plannedWorkout', 'targetPace', 'plannedDistance', 'plannedDurationSeconds', 'targetMetric', 'plannedPaceSecondsPerMile'] as const;
export function changesPrescription(before: WorkoutInput, after: WorkoutInput) {
  const beforeStructure = after.planStructure === null ? before.planStructure : 'originalSource' in before ? workoutStructure(before as import('./domain').Workout) : before.planStructure;
  return (after.planStructure !== undefined && JSON.stringify(after.planStructure) !== JSON.stringify(beforeStructure ?? null)) ||
    PLANNED_FIELDS.some(key => after[key] !== undefined && (before[key] ?? null) !== (after[key] ?? null));
}

export type Generation = {
  schemaVersion: 1; id: string; provider?: 'openai' | 'simulation'; status: 'generating' | 'review' | 'clarification' | 'failed' | 'accepted';
  startedAt: string; finishedAt: string | null; acceptedAt: string | null; alteredAt: string | null;
  model: string; promptVersion: string; validatorVersion: string;
  input: PlannerIntake; setupSnapshot: BlockSetup; calculationVersion?: typeof PLAN_CALCULATION_VERSION; assessmentContext?: PlanningContext;
  output: PlanOutput | null; error: string | null; validationFailure?: PlanValidationCode;
  responseId: string | null; usage: { inputTokens: number; outputTokens: number } | null;
};
export function simulatedBlock(plan: { generation?: Generation | null }) { return plan.generation?.provider === 'simulation'; }
export function acceptedPlan(plan: { generation?: Generation | null }) { return plan.generation?.status === 'accepted'; }

// Backup validation is offline; it does not confer authority or accept a plan.
export function validateGeneration(value: unknown): Generation {
  const input = z.object({
    provider: z.enum(['openai', 'simulation']).optional(),
    schemaVersion: z.literal(1), id: z.string().min(1).max(200),
    status: z.enum(['generating', 'review', 'clarification', 'failed', 'accepted']),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(), acceptedAt: z.string().datetime().nullable(), alteredAt: z.string().datetime().nullable(),
    model: z.string().min(1).max(200), promptVersion: z.string().min(1).max(100), validatorVersion: z.string().min(1).max(100),
    calculationVersion: z.literal(PLAN_CALCULATION_VERSION).optional(),
    assessmentContext: AssessmentContext.optional(), validationFailure: z.enum(PLAN_VALIDATION_CODES).optional(),
    input: z.unknown(), setupSnapshot: z.unknown(), output: z.unknown(), error: z.string().max(1000).nullable(),
    responseId: z.string().max(200).nullable(), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict().nullable(),
  }).strict().parse(value);
  if (input.validationFailure && input.status !== 'failed') throw new Error('Validation failure metadata needs a failed generation.');
  const setupSnapshot = validateSetup(input.setupSnapshot);
  const canonical = plannerIntake(setupSnapshot);
  if (JSON.stringify(input.input) !== JSON.stringify(canonical)) throw new Error('Planner input does not match its saved setup.');
  if (input.assessmentContext && JSON.stringify(input.assessmentContext) !== JSON.stringify(assessmentContext(canonical, input.assessmentContext.asOfDate))) throw new Error('Assessment dates do not match the saved intake.');
  const output = input.output === null ? null : validatePlanOutput(input.output, canonical, input.provider !== 'simulation' && requiresAssessment(input.promptVersion));
  if (output && input.calculationVersion) verifyCalculatedMeasurements(output, canonical);
  if (['review', 'accepted'].includes(input.status) && output?.outcome !== 'plan') throw new Error('A reviewed plan needs a validated schedule.');
  if (input.status === 'clarification' && output?.outcome !== 'needs_clarification') throw new Error('Missing planner clarification.');
  if ((input.status === 'accepted') !== (input.acceptedAt !== null) || (input.alteredAt !== null && input.status !== 'accepted')) throw new Error('Invalid acceptance metadata.');
  return { ...input, input: canonical, setupSnapshot, output };
}

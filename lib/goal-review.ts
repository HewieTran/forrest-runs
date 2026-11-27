import { z } from 'zod';
import { addDays, dateDiff } from './domain.ts';
import { plannerIntake, simpleSetup, validateSetup, type BlockSetup } from './setup.ts';
import type { PlannerIntake } from './planner.ts';
import type { TokenUsage } from './planner-policy.ts';
import { MAX_TRAINING_DAYS } from './training-window.ts';

export const GOAL_REVIEW_VERSION = 'goal-review-v1';
const days = z.array(z.number().int().min(0).max(6)).min(1).max(7)
  .refine(value => new Set(value).size === value.length);
export const ReviewOption = z.object({
  kind: z.enum(['training_days', 'race_date', 'target_time']),
  reason: z.string().trim().min(1).max(400),
  targetDurationSeconds: z.number().int().positive().max(86400).nullable(),
  additionalDays: z.number().int().positive().max(MAX_TRAINING_DAYS).nullable(),
  trainingDays: days.nullable(),
}).strict();
export const GoalReviewOutput = z.object({
  decision: z.enum(['proceed', 'adjust', 'unsupported']),
  reason: z.string().trim().min(1).max(800),
  approach: z.string().trim().min(1).max(600),
  options: z.array(ReviewOption).max(3),
}).strict();
export type GoalReviewOutput = z.infer<typeof GoalReviewOutput>;
export type ReviewOption = z.infer<typeof ReviewOption>;
export const ReviewSelection = z.object({
  reviewId: z.string().min(1).max(200),
  option: z.enum(['training_days', 'race_date', 'target_time']).nullable(),
  trainingDays: days.optional(),
}).strict();
export type ReviewSelection = z.infer<typeof ReviewSelection>;
export type GoalReview = {
  schemaVersion: 1; id: string; promptVersion: string; provider: 'openai' | 'simulation'; model: string;
  status: 'assessing' | 'ready' | 'failed'; startedAt: string; finishedAt: string | null;
  setupSnapshot: BlockSetup; input: PlannerIntake; output: GoalReviewOutput | null;
  error: string | null; responseId: string | null; usage: TokenUsage | null;
  confirmation?: { selection: ReviewSelection; setup: BlockSetup; confirmedAt: string };
};

export function sameReviewInput(setup: BlockSetup, input: PlannerIntake) {
  try { return JSON.stringify(plannerIntake(setup)) === JSON.stringify(input); }
  catch { return false; }
}
export function validateGoalReviewOutput(value: unknown, input: PlannerIntake): GoalReviewOutput {
  const output = GoalReviewOutput.parse(value);
  if ((output.decision === 'proceed' && output.options.length) ||
      (output.decision === 'adjust' && !output.options.length) ||
      new Set(output.options.map(option => option.kind)).size !== output.options.length) throw new Error('The goal review returned inconsistent choices.');
  for (const option of output.options) {
    if (option.kind === 'target_time') {
      if (option.additionalDays !== null || option.trainingDays !== null || option.targetDurationSeconds === null ||
          input.goal.targetDurationSeconds === null || option.targetDurationSeconds <= input.goal.targetDurationSeconds) throw new Error('Invalid target-time option.');
    } else if (option.kind === 'race_date') {
      if (option.targetDurationSeconds !== null || option.trainingDays !== null || option.additionalDays === null ||
          dateDiff(input.goal.raceDate, input.goal.startDate) + option.additionalDays > MAX_TRAINING_DAYS) throw new Error('Invalid race-date option.');
    } else if (option.targetDurationSeconds !== null || option.additionalDays !== null || !option.trainingDays ||
        option.trainingDays.length <= input.availability.trainingDays.length ||
        input.availability.trainingDays.some(day => !option.trainingDays!.includes(day))) throw new Error('Invalid training-day option.');
  }
  return output;
}

// Only a server-saved offered option can change the intake. The benchmark is immutable here.
export function confirmGoalReview(review: GoalReview, setup: BlockSetup, selection: ReviewSelection, today: string) {
  if (review.id !== selection.reviewId || review.status !== 'ready' || !review.output || review.promptVersion !== GOAL_REVIEW_VERSION)
    throw new Error('Review your goal before generating a plan.');
  if (review.confirmation && sameReviewInput(setup, plannerIntake(review.confirmation.setup))) {
    if (JSON.stringify(review.confirmation.selection) !== JSON.stringify(selection)) throw new Error('This review was already confirmed with another choice. Review your setup again.');
    return setup;
  }
  if (!sameReviewInput(setup, review.input)) throw new Error('Your setup changed. Review your goal again before generating.');
  const output = validateGoalReviewOutput(review.output, review.input);
  const next = simpleSetup(setup);
  if (selection.option === null) {
    if (output.decision !== 'proceed' || selection.trainingDays) throw new Error('Choose one of the supported changes or edit your setup.');
  } else {
    const option = output.options.find(option => option.kind === selection.option);
    if (!option) throw new Error('That change was not offered by this goal review.');
    if (option.kind === 'target_time') next.goal.targetDurationSeconds = option.targetDurationSeconds;
    else if (option.kind === 'race_date') next.goal.targetDate = addDays(next.goal.targetDate, option.additionalDays!);
    else {
      const selectedDays = selection.trainingDays ?? option.trainingDays!;
      if (selectedDays.length !== option.trainingDays!.length || next.availability.days.some(day => !selectedDays.includes(day)))
        throw new Error('Keep your selected days and choose the offered number of extra days.');
      next.availability.days = [...selectedDays].sort((a, b) => a - b);
    }
    if (option.kind !== 'training_days' && selection.trainingDays) throw new Error('This option does not change training days.');
  }
  return validateSetup(next, today);
}

// Offline backup validation preserves provenance without granting generation authority.
export function validateGoalReview(value: unknown): GoalReview {
  const parsed = z.object({
    schemaVersion: z.literal(1), id: z.string().min(1).max(200), promptVersion: z.literal(GOAL_REVIEW_VERSION),
    provider: z.enum(['openai', 'simulation']), model: z.string().min(1).max(200),
    status: z.enum(['assessing', 'ready', 'failed']), startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
    setupSnapshot: z.unknown(), input: z.unknown(), output: z.unknown(), error: z.string().max(1000).nullable(),
    responseId: z.string().max(200).nullable(), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).nullable(),
    confirmation: z.object({ selection: ReviewSelection, setup: z.unknown(), confirmedAt: z.string().datetime() }).strict().optional(),
  }).strict().parse(value);
  const setupSnapshot = validateSetup(parsed.setupSnapshot);
  const input = plannerIntake(setupSnapshot);
  if (JSON.stringify(input) !== JSON.stringify(parsed.input)) throw new Error('Goal review input does not match its snapshot.');
  const output = parsed.output === null ? null : validateGoalReviewOutput(parsed.output, input);
  if ((parsed.status === 'ready') !== (output !== null)) throw new Error('Goal review status does not match its output.');
  let confirmation;
  if (parsed.confirmation) {
    const review = { ...parsed, input, output, setupSnapshot, confirmation: undefined } as GoalReview;
    const expected = confirmGoalReview(review, setupSnapshot, parsed.confirmation.selection, setupSnapshot.goal.startDate);
    const setup = validateSetup(parsed.confirmation.setup);
    if (!sameReviewInput(setup, plannerIntake(expected))) throw new Error('Goal confirmation does not match its offered change.');
    confirmation = { ...parsed.confirmation, setup };
  }
  return { ...parsed, setupSnapshot, input, output, ...(confirmation ? { confirmation } : {}) } as GoalReview;
}

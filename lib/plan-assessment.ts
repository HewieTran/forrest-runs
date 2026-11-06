import { z } from 'zod';
import { dateDiff, validDate } from './domain.ts';
import type { PlannerIntake } from './planner.ts';

export const ASSESSMENT_ACTIONS = ['target_time', 'race_date', 'benchmark', 'training_days'] as const;
export type AssessmentAction = typeof ASSESSMENT_ACTIONS[number];
export const GoalAssessment = z.object({
  decision: z.enum(['proceed', 'adjust_goal', 'refresh_benchmark', 'clarify']),
  reason: z.string().trim().min(1).max(600),
  actions: z.array(z.enum(ASSESSMENT_ACTIONS)).max(4).refine(actions => new Set(actions).size === actions.length),
}).strict();
export const AssessmentContext = z.object({
  asOfDate: z.string().refine(validDate),
  benchmarkAgeDays: z.number().int().nonnegative().nullable(),
  benchmarkAgeAtStartDays: z.number().int().nonnegative().nullable(),
  trainingWindowDays: z.number().int().nonnegative(),
}).strict();
export type PlanningContext = z.infer<typeof AssessmentContext>;

// Calendar facts, not physiological cutoffs or performance predictions.
export function assessmentContext(input: PlannerIntake, asOfDate: string): PlanningContext {
  const result = input.baseline.results[0];
  return AssessmentContext.parse({ asOfDate,
    benchmarkAgeDays: result ? dateDiff(asOfDate, result.date) : null,
    benchmarkAgeAtStartDays: result ? dateDiff(input.goal.startDate, result.date) : null,
    trainingWindowDays: dateDiff(input.goal.raceDate, input.goal.startDate),
  });
}
export const ASSESSMENT_LABELS: Record<AssessmentAction, string> = {
  target_time: 'Edit target finish time', race_date: 'Edit race date',
  benchmark: 'Update performance benchmark', training_days: 'Edit training days',
};
export function assessmentStep(action: string | undefined) {
  return action === 'benchmark' ? 1 : action === 'training_days' ? 2 : 0;
}
export const ASSESSMENT_FIELDS: Record<AssessmentAction, string> = {
  target_time: 'setup-targetTime', race_date: 'setup-targetDate',
  benchmark: 'setup-benchmarkDistance', training_days: 'setup-trainingDays',
};

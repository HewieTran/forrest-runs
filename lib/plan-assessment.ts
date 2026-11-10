import { z } from 'zod';
import { addDays, dateDiff, validDate } from './domain.ts';
import type { PlannerIntake } from './planner.ts';
import { MAX_TRAINING_DAYS, trainingWindowIssue } from './training-window.ts';

export const ASSESSMENT_ACTIONS = ['target_time', 'race_date', 'benchmark', 'training_days'] as const;
export type AssessmentAction = typeof ASSESSMENT_ACTIONS[number];
export const GoalAssessment = z.object({
  decision: z.enum(['proceed', 'adjust_goal', 'refresh_benchmark', 'clarify']),
  reason: z.string().trim().min(1).max(600),
  actions: z.array(z.enum(ASSESSMENT_ACTIONS)).max(4).refine(actions => new Set(actions).size === actions.length),
  suggestions: z.object({
    finishTime: z.object({
      durationSeconds: z.number().int().positive().max(86400),
      reason: z.string().trim().min(1).max(300),
    }).strict().nullable(),
    schedule: z.object({
      additionalDays: z.number().int().min(0).max(MAX_TRAINING_DAYS),
      trainingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
        .refine(days => new Set(days).size === days.length).nullable(),
      reason: z.string().trim().min(1).max(300),
    }).strict().nullable(),
  }).strict().nullable().optional(), // Historical assessments did not include suggestions.
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

export type GoalSuggestion =
  | { kind: 'finish_time'; durationSeconds: number; reason: string }
  | { kind: 'schedule'; date: { field: 'startDate' | 'targetDate'; from: string; to: string } | null;
      additionalDays: number; trainingDays: number[] | null; reason: string };

// Keep the race date whenever the full proposed extension fits before it.
// The app chooses the dates; the model only proposes the extra calendar days.
export function goalSuggestions(assessment: z.infer<typeof GoalAssessment> | undefined, input: PlannerIntake, today: string): GoalSuggestion[] {
  const offered = assessment?.suggestions;
  if (!offered || (assessment.decision !== 'adjust_goal' && assessment.decision !== 'clarify')) return [];
  const { startDate, raceDate, targetDurationSeconds } = input.goal;
  if (trainingWindowIssue(startDate, raceDate, today) || targetDurationSeconds === null) return [];

  const suggestions: GoalSuggestion[] = [];
  const { finishTime, schedule } = offered;
  if (finishTime && finishTime.durationSeconds > targetDurationSeconds) {
    suggestions.push({ kind: 'finish_time', ...finishTime });
  }
  if (!schedule || dateDiff(raceDate, startDate) + schedule.additionalDays > MAX_TRAINING_DAYS) return suggestions;

  const changedDays = schedule.trainingDays && (
    schedule.trainingDays.length !== input.availability.trainingDays.length ||
    schedule.trainingDays.some(day => !input.availability.trainingDays.includes(day))
  ) ? [...schedule.trainingDays].sort((a, b) => a - b) : null;
  const earlierStart = addDays(startDate, -schedule.additionalDays);
  const date = schedule.additionalDays === 0 ? null : earlierStart >= today
    ? { field: 'startDate' as const, from: startDate, to: earlierStart }
    : { field: 'targetDate' as const, from: raceDate, to: addDays(raceDate, schedule.additionalDays) };
  if (date && !validDate(date.to)) return suggestions;
  if (date || changedDays) suggestions.push({
    kind: 'schedule', date, trainingDays: changedDays, additionalDays: schedule.additionalDays, reason: schedule.reason,
  });
  return suggestions;
}

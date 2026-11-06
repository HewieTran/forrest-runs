// Safe diagnostics only: no provider text, field values, prompts or credentials.
export const PLAN_VALIDATION_CODES = ['response_format', 'output_shape', 'assessment', 'schedule_completeness', 'schedule_dates', 'session_limit', 'race', 'warmup_cooldown', 'numeric_targets', 'workout_arithmetic', 'workout_text', 'phases'] as const;
export type PlanValidationCode = typeof PLAN_VALIDATION_CODES[number];
const REASONS: Record<PlanValidationCode, string> = {
  response_format: 'The planner returned a response the app could not read.',
  output_shape: 'The planner returned incomplete or unsupported workout details.',
  assessment: 'The planner returned an incomplete or contradictory goal assessment.',
  schedule_completeness: 'The planner returned the wrong number of workouts for your selected days.',
  schedule_dates: 'The planner used a duplicate date or a date outside your running schedule.',
  session_limit: 'A generated workout exceeded its session time limit.',
  race: 'The generated race did not match the required 5K race date or distance.',
  warmup_cooldown: 'A generated quality workout was missing warm-up or cooldown steps.',
  numeric_targets: 'A generated running step had missing or unsupported distance or pace targets.',
  workout_arithmetic: 'The AI generated inconsistent workout numbers.',
  workout_text: 'Some generated workout instructions exceeded the supported length.',
  phases: 'The planner used a training phase that is unsupported for 5K.',
};
export class PlanValidationError extends Error {
  readonly code: PlanValidationCode;
  constructor(code: PlanValidationCode) { super(REASONS[code]); this.code = code; }
}
export const LEGACY_VALIDATION_MESSAGE = 'The generated draft did not pass the schedule checks. No workouts were saved. Review your inputs before trying again.';
export function planValidationMessage(code?: PlanValidationCode) {
  return `${code ? REASONS[code] : 'We couldn’t validate a complete generated plan.'} Your inputs are saved and no workouts were created. You can retry with the same inputs; another attempt may use API credits.`;
}
export function displayGenerationError(message: string) {
  if (message === LEGACY_VALIDATION_MESSAGE) return planValidationMessage();
  if (message.includes(' This does not tell us whether your goal is too ambitious.')) {
    const code = message.startsWith('A generated workout’s distance, pace and duration did not agree.') ? 'workout_arithmetic'
      : PLAN_VALIDATION_CODES.find(code => message.startsWith(REASONS[code]));
    return planValidationMessage(code);
  }
  return message;
}

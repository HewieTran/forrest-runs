// Portable policy. Currency values are integer millionths of a US dollar.
// Standard Luna rates checked 2026-10-31; update this version before rates change.
export const APPROVED_PLAN_MODEL = 'gpt-6-luna';
export const PRICING_VERSION = 'luna-standard-2026-10-31';
export const INPUT_MICRODOLLARS_PER_MILLION = 100000;
export const OUTPUT_MICRODOLLARS_PER_MILLION = 500000;
export const MONTHLY_BUDGET_MICRODOLLARS = 4000000; // $1 below Hieu's $5 Platform cap.
export const REQUEST_RESERVE_MICRODOLLARS = 25000;
export const DAILY_ATTEMPT_LIMIT = 10;
export const MAX_INPUT_TOKEN_BOUND = 60000;
export const MAX_OUTPUT_TOKENS = 30000;
export type TokenUsage = { inputTokens: number; outputTokens: number };

export function readTokenUsage(value: unknown): TokenUsage | null {
  const usage = value as { input_tokens?: unknown; output_tokens?: unknown } | null;
  const valid = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  return usage && valid(usage.input_tokens) && valid(usage.output_tokens)
    ? { inputTokens: Number(usage.input_tokens), outputTokens: Number(usage.output_tokens) } : null;
}

export function estimatedCost(usage: TokenUsage): number {
  return Math.ceil((usage.inputTokens * INPUT_MICRODOLLARS_PER_MILLION
    + usage.outputTokens * OUTPUT_MICRODOLLARS_PER_MILLION) / 1000000);
}

export function usageWithinReservation(usage: TokenUsage) {
  return usage.inputTokens <= MAX_INPUT_TOKEN_BOUND && usage.outputTokens <= MAX_OUTPUT_TOKENS;
}

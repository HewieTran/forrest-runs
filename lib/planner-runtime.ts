import { env } from 'cloudflare:workers';
import { PlanProviderError, type PlanProviderConfig } from './openai-plan';
import { APPROVED_PLAN_MODEL } from './planner-policy';
export type PlannerMode = 'disabled' | 'simulation' | 'openai';
export function plannerMode(): PlannerMode {
  const values = env as unknown as Record<string, string | undefined>;
  return values.TRAINING_PLANNER_MODE === 'simulation' ? 'simulation' : values.TRAINING_PLANNER_MODE === 'openai' ? 'openai' : 'disabled';
}
export function plannerConfigured() {
  if (plannerMode() === 'simulation') return true;
  const values = env as unknown as Record<string, string | undefined>;
  return plannerMode() === 'openai' && Boolean(values.OPENAI_API_KEY) && values.OPENAI_PLAN_MODEL === APPROVED_PLAN_MODEL;
}
export function plannerConfiguration(): PlanProviderConfig {
  const values = env as unknown as Record<string, string | undefined>;
  if (plannerMode() !== 'openai' || !values.OPENAI_API_KEY || !values.OPENAI_PLAN_MODEL) throw new PlanProviderError('configuration');
  if (values.OPENAI_PLAN_MODEL !== APPROVED_PLAN_MODEL) throw new PlanProviderError('model_restricted');
  return { apiKey: values.OPENAI_API_KEY, model: values.OPENAI_PLAN_MODEL };
}

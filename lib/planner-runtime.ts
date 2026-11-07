import { getRuntimeVariables } from '@forrest/platform';
import { PlanProviderError, type PlanProviderConfig } from './openai-plan';
import { APPROVED_PLAN_MODEL } from './planner-policy';
export type PlannerMode = 'disabled' | 'simulation' | 'openai';
export function plannerMode(): PlannerMode {
  const values = getRuntimeVariables();
  return values.TRAINING_PLANNER_MODE === 'simulation' ? 'simulation' : values.TRAINING_PLANNER_MODE === 'openai' ? 'openai' : 'disabled';
}
export function plannerConfigured() {
  if (plannerMode() === 'simulation') return true;
  const values = getRuntimeVariables();
  return plannerMode() === 'openai' && Boolean(values.OPENAI_API_KEY) && values.OPENAI_PLAN_MODEL === APPROVED_PLAN_MODEL;
}
export function plannerConfiguration(): PlanProviderConfig {
  const values = getRuntimeVariables();
  if (plannerMode() !== 'openai' || !values.OPENAI_API_KEY || !values.OPENAI_PLAN_MODEL) throw new PlanProviderError('configuration');
  if (values.OPENAI_PLAN_MODEL !== APPROVED_PLAN_MODEL) throw new PlanProviderError('model_restricted');
  return { apiKey: values.OPENAI_API_KEY, model: values.OPENAI_PLAN_MODEL };
}

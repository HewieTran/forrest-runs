import { getRuntimeVariables } from '@forrest/platform';
import { PlanProviderError, type PlanProviderConfig } from './openai-plan';
import { APPROVED_PLAN_MODEL } from './planner-policy';
import type { AppUser } from './user';
export type PlannerMode = 'disabled' | 'simulation' | 'openai';
export function plannerMode(user?: Pick<AppUser, 'email'>): PlannerMode {
  const values = getRuntimeVariables();
  if (values.TRAINING_PLANNER_MODE === 'simulation') return 'simulation';
  if (values.TRAINING_PLANNER_MODE !== 'openai') return 'disabled';
  const pilot = values.FORREST_LIVE_GENERATOR_ALLOWED_EMAILS;
  if (pilot !== undefined) {
    const emails = pilot.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    if (!user || !emails.includes(user.email.trim().toLowerCase())) return 'simulation';
  }
  return 'openai';
}
export function plannerConfigured(user?: Pick<AppUser, 'email'>) {
  if (plannerMode(user) === 'simulation') return true;
  const values = getRuntimeVariables();
  return plannerMode(user) === 'openai' && Boolean(values.OPENAI_API_KEY) && values.OPENAI_PLAN_MODEL === APPROVED_PLAN_MODEL;
}
export function plannerConfiguration(user?: Pick<AppUser, 'email'>): PlanProviderConfig {
  const values = getRuntimeVariables();
  if (plannerMode(user) !== 'openai' || !values.OPENAI_API_KEY || !values.OPENAI_PLAN_MODEL) throw new PlanProviderError('configuration');
  if (values.OPENAI_PLAN_MODEL !== APPROVED_PLAN_MODEL) throw new PlanProviderError('model_restricted');
  return { apiKey: values.OPENAI_API_KEY, model: values.OPENAI_PLAN_MODEL,
    // The Node adapter supplies this fixed bound; absent on existing Sites.
    timeoutMs: values.OPENAI_PLAN_TIMEOUT_MS === '110000' ? 110_000 : undefined };
}

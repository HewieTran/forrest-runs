import { centralToday } from '../../../../../lib/domain';
import { authenticated, body, json, serverError } from '../../../../../lib/api';
import { startPlanGeneration, finishPlanGeneration, settlePlanUsage, userPlan, acceptGeneratedPlan } from '../../../../../lib/store';
import { acceptedPlan } from '../../../../../lib/planner';
import { simulatedPlan, SIMULATION_MODEL } from '../../../../../lib/simulated-plan';
import { plannerMode, plannerConfiguration } from '../../../../../lib/planner-runtime';
import { PlanProviderError, requestOpenAIPlan } from '../../../../../lib/openai-plan';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before generating a plan.' }, 401);
  let version, saveImmediately = false;
  try {
    const input = await body(request);
    if (!Number.isSafeInteger(input.version) || input.version < 1 || input.consent !== true) throw new Error('Review the saved intake and confirm plan generation.');
    version = input.version;
    saveImmediately = input.saveImmediately === true;
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid generation request.' }, 400); }
  try {
    const { id } = await params;
    const current = await userPlan(user, id); // Ownership checked before provider configuration.
    if (saveImmediately && acceptedPlan(current)) {
      const { ownerId: _ownerId, ...block } = current;
      return json({ block });
    }
    if (saveImmediately && current.generation?.status === 'review' && current.version === version)
      return json({ block: await acceptGeneratedPlan(user, id, version, current.generation.id) });
    const mode = plannerMode();
    // Simulation is selected only by the server configuration. There is no
    // provider fallback; API keys are never read or used in this branch.
    const config = mode === 'simulation' ? null : plannerConfiguration();
    const block = await startPlanGeneration(user, id, version, config?.model ?? SIMULATION_MODEL, mode === 'simulation' ? 'simulation' : 'openai');
    const generation = block.generation!;
    let result;
    try { result = mode === 'simulation' ? simulatedPlan(generation.input) : await requestOpenAIPlan(generation.input, { ...config!, asOfDate: centralToday() }); }
    catch (error) { result = error instanceof PlanProviderError ? error : new PlanProviderError('provider'); }
    if (mode === 'openai') await settlePlanUsage(user, generation.id, result);
    const saved = await finishPlanGeneration(user, id, generation.id, result);
    if (saveImmediately && saved.generation?.status === 'review') {
      try { return json({ block: await acceptGeneratedPlan(user, id, saved.version, generation.id) }); }
      catch (error) { return serverError(error); }
    }
    return json({ block: saved, ...(result instanceof PlanProviderError ? { error: result.message, errorCode: result.code } : {}) }, result instanceof PlanProviderError ? result.httpStatus : 200);
  } catch (error) {
    if (error instanceof PlanProviderError) return json({ error: error.message, errorCode: error.code }, error.httpStatus);
    return serverError(error);
  }
}

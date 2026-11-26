import { authenticated, body, json, serverError } from '../../../../../lib/api';
import { centralToday } from '../../../../../lib/domain';
import { GOAL_REVIEW_VERSION, sameReviewInput } from '../../../../../lib/goal-review';
import { plannerMode, plannerConfiguration } from '../../../../../lib/planner-runtime';
import { PlanProviderError } from '../../../../../lib/openai-plan';
import { requestGoalReview, simulatedGoalReview } from '../../../../../lib/openai-goal-review';
import { startGoalReview, finishGoalReview, settlePlanUsage, userPlan } from '../../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to review your goal.' }, 401);
  let version;
  try {
    const input = await body(request);
    if (!Number.isSafeInteger(input.version) || input.version < 1 || input.consent !== true) throw new Error('Save your setup and confirm goal review.');
    version = input.version;
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid request.' }, 400); }
  try {
    const { id } = await params;
    const current = await userPlan(user, id);
    const mode = plannerMode(user);
    const config = mode === 'simulation' ? null : plannerConfiguration(user);
    if (current.version !== version) return json({ error: 'Your setup changed. Reload before reviewing your goal.' }, 409);
    if (current.status === 'draft' && current.setup && current.goalReview?.status === 'ready' && current.goalReview.promptVersion === GOAL_REVIEW_VERSION && current.goalReview.provider === mode &&
        sameReviewInput(current.setup, current.goalReview.input)) {
      const { ownerId: _ownerId, ...block } = current;
      return json({ block });
    }
    const reserved = await startGoalReview(user, id, version, config?.model ?? 'simulated-goal-review-v1', mode === 'simulation' ? 'simulation' : 'openai');
    let result;
    try { result = mode === 'simulation' ? simulatedGoalReview() : await requestGoalReview(reserved.goalReview!.input, { ...config!, asOfDate: centralToday() }); }
    catch (error) { result = error instanceof PlanProviderError ? error : new PlanProviderError('provider'); }
    if (mode === 'openai') await settlePlanUsage(user, reserved.goalReview!.id, result);
    const block = await finishGoalReview(user, id, reserved.goalReview!.id, result);
    return json({ block, ...(result instanceof PlanProviderError ? { error: block.goalReview?.error, errorCode: result.code } : {}) }, result instanceof PlanProviderError ? result.httpStatus : 200);
  } catch (error) {
    if (error instanceof PlanProviderError) return json({ error: error.message, errorCode: error.code }, error.httpStatus);
    return serverError(error);
  }
}

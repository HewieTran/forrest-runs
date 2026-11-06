import { notFound, redirect } from 'next/navigation';
import PlanGeneration from '../../../../components/PlanGeneration';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { userPlan } from '../../../../lib/store';
import { centralToday } from '../../../../lib/domain';
import { plannerMode, plannerConfigured } from '../../../../lib/planner-runtime';
import { TrainingRequestError } from '../../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}/plan`));
  let block;
  try { const { ownerId: _ownerId, ...owned } = await userPlan(user, id); block = owned; }
  catch (error) { if (error instanceof TrainingRequestError && error.status === 404) notFound(); throw error; }
  if (!block.setup) redirect(`/blocks/${encodeURIComponent(id)}`);
  return <PlanGeneration initial={block} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} mode={plannerMode()} configured={plannerConfigured()} today={centralToday()} />;
}

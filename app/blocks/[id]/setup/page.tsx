import { ASSESSMENT_ACTIONS, type AssessmentAction } from '../../../../lib/plan-assessment';
import { notFound, redirect } from 'next/navigation';
import SetupWizard from '../../../../components/SetupWizard';
import AppHeader from '../../../../components/AppHeader';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { loadSetupPage } from '../../../../lib/store';
import { centralToday } from '../../../../lib/domain';
import { TrainingRequestError } from '../../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function SetupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}/setup`));
  try {
    const { block, hasWorkouts } = await loadSetupPage(user, id);
    if (!block.setup) {
      if (block.status !== 'draft' || hasWorkouts) return <><AppHeader displayName={user.fullName?.split(' ')[0] ?? 'Runner'} /><main className="main-content"><h1>Keep this block’s history.</h1><p className="blocks-intro">Guided setup starts with an empty draft. Your existing workouts and results are preserved.</p><p className="block-callout"><a href={`/blocks/${encodeURIComponent(id)}`}>Return to this block →</a></p><a className="button primary" href="/blocks/new">Start a guided draft</a></main></>;
    }
    const today = centralToday();
    const { edit } = await searchParams;
    const initialEdit = ASSESSMENT_ACTIONS.includes(edit as AssessmentAction) ? edit as AssessmentAction : undefined;
    return <SetupWizard initialEdit={initialEdit} initial={block} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} today={today} readOnly={block.status !== 'draft' || hasWorkouts} />;
  } catch (error) {
    if (error instanceof TrainingRequestError && error.status === 404) notFound();
    throw error;
  }
}

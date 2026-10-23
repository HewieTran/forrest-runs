import { notFound, redirect } from 'next/navigation';
import SetupWizard from '../../../../components/SetupWizard';
import AppHeader from '../../../../components/AppHeader';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { loadSetupPage } from '../../../../lib/store';
import { centralToday } from '../../../../lib/domain';
import { TrainingRequestError } from '../../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
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
    return <SetupWizard initial={block} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} today={centralToday()} readOnly={block.status !== 'draft' || hasWorkouts} />;
  } catch (error) {
    if (error instanceof TrainingRequestError && error.status === 404) notFound();
    throw error;
  }
}

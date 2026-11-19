import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { loadTraining } from '../../../../lib/store';
import { TrainingRequestError } from '../../../../lib/training-errors';

export const dynamic = 'force-dynamic';
export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}/progress`));
  try {
    await loadTraining(user, id);
    redirect(`/blocks/${encodeURIComponent(id)}#progress`);
  } catch (error) {
    if (error instanceof TrainingRequestError && error.status === 404) notFound();
    throw error;
  }
}

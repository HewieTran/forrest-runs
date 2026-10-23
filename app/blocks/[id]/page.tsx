import { notFound, redirect } from 'next/navigation';
import Tracker from '../../../components/Tracker';
import { getCurrentUser, signInPath } from '../../../lib/auth';
import { activeBlock, loadTraining } from '../../../lib/store';
import { TrainingRequestError } from '../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function BlockDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}`));
  try {
    const [data, active] = await Promise.all([loadTraining(user, id), activeBlock(user)]);
    return <Tracker initial={data} activeBlock={active} />;
  } catch (error) {
    if (error instanceof TrainingRequestError && error.status === 404) notFound();
    throw error;
  }
}

import { notFound, redirect } from 'next/navigation';
import BlockSettings from '../../../../components/BlockSettings';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { loadTraining, activeBlock } from '../../../../lib/store';
import { TrainingRequestError } from '../../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}/settings`));
  try {
    const [data, active] = await Promise.all([loadTraining(user, id), activeBlock(user)]);
    return <BlockSettings initial={data} activeBlock={active} />;
  } catch (error) { if (error instanceof TrainingRequestError && error.status === 404) notFound();throw error; }
}

import { notFound, redirect } from 'next/navigation';
import Tracker from '../../../../components/Tracker';
import { getCurrentUser, signInPath } from '../../../../lib/auth';
import { loadTraining } from '../../../../lib/store';
import { TrainingRequestError } from '../../../../lib/training-errors';
export const dynamic = 'force-dynamic';
export default async function BlockSchedule({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const query = await searchParams;
  const date = typeof query.date === 'string' ? query.date : undefined;
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/blocks/${encodeURIComponent(id)}/schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`));
  try {
    return <Tracker initial={await loadTraining(user, id)} view="schedule" initialDate={date} />;
  } catch (error) {
    if (error instanceof TrainingRequestError && error.status === 404) notFound();
    throw error;
  }
}

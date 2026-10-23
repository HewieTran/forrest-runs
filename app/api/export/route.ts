import { authenticated, blockIdFromRequest, json, serverError } from '../../../lib/api';
import { exportTraining, loadTraining } from '../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to export your training.' }, 401);
  try {
    const blockId = blockIdFromRequest(request);
    let backup;
    if (blockId !== undefined) {
      const { plan, workouts } = await loadTraining(user, blockId);
      backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), plan, workouts };
    } else {
      backup = await exportTraining(user);
    }
    return new Response(JSON.stringify(backup, null, 2), { headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="forrest-runs${blockId === undefined ? '' : '-block'}-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return serverError(error); }
}

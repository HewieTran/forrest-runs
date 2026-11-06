import { authenticated, body, json, serverError } from '../../../../../../lib/api';
import { acceptGeneratedPlan } from '../../../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before accepting a plan.' }, 401);
  let version, generationId;
  try {
    const input = await body(request);
    if (!Number.isSafeInteger(input.version) || input.version < 1 || typeof input.generationId !== 'string' || !input.generationId || input.generationId.length > 200) throw new Error('Reload and review the latest generated plan.');
    version = input.version; generationId = input.generationId;
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid acceptance request.' }, 400); }
  try { const { id } = await params; return json({ block: await acceptGeneratedPlan(user, id, version, generationId) }); }
  catch (error) { return serverError(error); }
}

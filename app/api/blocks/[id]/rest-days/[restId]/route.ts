import { authenticated, body, json, serverError } from '../../../../../../lib/api';
import { removeRestDay } from '../../../../../../lib/store';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; restId: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before saving.' }, 401);
  let version: number;
  try {
    const input = await body(request);
    const value = input && typeof input === 'object' ? (input as Record<string, unknown>).version : undefined;
    if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('Reload this rest day before removing it.');
    version = Number(value);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid rest day.' }, 400);
  }
  try {
    const { id, restId } = await params;
    const removed = await removeRestDay(user, id, restId, version);
    if (!removed) return json({ error: 'This rest day changed or is unavailable. Reload the schedule.' }, 409);
    return json({ removed: true });
  } catch (error) { return serverError(error); }
}

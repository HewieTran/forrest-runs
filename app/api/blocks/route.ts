import { authenticated, json, serverError } from '../../../lib/api';
import { listBlocks } from '../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to load your training blocks.' }, 401);
  try { return json({ blocks: await listBlocks(user) }); }
  catch (error) { return serverError(error); }
}

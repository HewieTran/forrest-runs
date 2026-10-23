import { authenticated, body, json, serverError } from '../../../lib/api';
import { createBlock, loadBlockLibrary } from '../../../lib/store';
import { validateNewBlock } from '../../../lib/blocks';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to load your training blocks.' }, 401);
  try { return json({ blocks: await loadBlockLibrary(user) }); }
  catch (error) { return serverError(error); }
}
export async function POST(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before creating a block.' }, 401);
  let input;
  try { input = validateNewBlock(await body(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid block.' }, 400); }
  try { return json({ block: await createBlock(user, input) }, 201); }
  catch (error) { return serverError(error); }
}

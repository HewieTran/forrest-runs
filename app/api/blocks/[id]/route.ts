import { authenticated, body, json, serverError } from '../../../../lib/api';
import { changeBlockStatus } from '../../../../lib/store';
import { validateBlockStatus } from '../../../../lib/blocks';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before changing a block.' }, 401);
  let input;
  try { input = validateBlockStatus(await body(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid status.' }, 400); }
  try {
    const { id } = await params;
    return json({ block: await changeBlockStatus(user, id, input) });
  } catch (error) { return serverError(error); }
}

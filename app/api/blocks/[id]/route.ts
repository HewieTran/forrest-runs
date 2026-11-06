import { authenticated, body, json, serverError } from '../../../../lib/api';
import { changeBlockStatus, deleteBlock, previewBlockDeletion } from '../../../../lib/store';
import { validateBlockStatus, validateBlockDeletion } from '../../../../lib/blocks';
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to load this block.' }, 401);
  try { const { id } = await params; return json({ deletion: await previewBlockDeletion(user, id) }); }
  catch (error) { return serverError(error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before deleting a block.' }, 401);
  let input;
  try { input = validateBlockDeletion(await body(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid deletion request.' }, 400); }
  try { const { id } = await params; return json(await deleteBlock(user, id, input)); }
  catch (error) { return serverError(error); }
}

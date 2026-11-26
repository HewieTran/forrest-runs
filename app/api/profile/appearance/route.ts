import { authenticated, body, json, serverError } from '../../../../lib/api';
import { saveAppearance } from '../../../../lib/store';
import { profileView } from '../../../../lib/profile';
import { validateAppearance } from '../../../../lib/appearance';
export async function PATCH(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to save your appearance.' }, 401);
  let input;
  try { input = validateAppearance(await body(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Choose an appearance.' }, 400); }
  try { return json({ account: profileView(await saveAppearance(user, input), user.userId, user.fullName) }); }
  catch (error) { return serverError(error); }
}

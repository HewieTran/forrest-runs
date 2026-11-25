import { authenticated, body, json, serverError } from '../../../lib/api';
import { loadProfile, saveProfile } from '../../../lib/store';
import { profileView, validateProfile } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to view your profile.' }, 401);
  try { return json({ account: profileView(await loadProfile(user), user.userId, user.fullName) }); }
  catch (error) { return serverError(error); }
}
export async function PATCH(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to save your profile.' }, 401);
  let input;
  try { input = validateProfile(await body(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Check your profile details.' }, 400); }
  try { return json({ account: profileView(await saveProfile(user, input), user.userId, user.fullName) }); }
  catch (error) { return serverError(error); }
}

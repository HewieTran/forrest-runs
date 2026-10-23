import { authenticated, blockIdFromRequest, body, json, serverError } from '../../../lib/api';
import { loadTraining, saveRaceSettings } from '../../../lib/store';
import { validDate, type RaceSettingsInput } from '../../../lib/domain';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to load your training.' }, 401);
  try { return json(await loadTraining(user, blockIdFromRequest(request))); }
  catch (error) { return serverError(error); }
}

export async function PATCH(request: Request) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before saving.' }, 401);
  let input: RaceSettingsInput;
  try {
    const values = await body(request);
    if (
      typeof values.raceName !== 'string' || !values.raceName.trim() || values.raceName.length > 120 ||
      !validDate(values.raceDate) || !Number.isInteger(values.version) || values.version < 1
    ) throw new Error('Enter a race name and valid race date.');
    input = { raceName: values.raceName, raceDate: values.raceDate, version: values.version };
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid settings.' }, 400);
  }
  try { return json(await saveRaceSettings(user, input, blockIdFromRequest(request))); }
  catch (error) { return serverError(error); }
}

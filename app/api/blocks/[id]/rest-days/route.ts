import { authenticated, body, json, serverError } from '../../../../../lib/api';
import { validDate } from '../../../../../lib/domain';
import { addRestDay } from '../../../../../lib/store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before saving.' }, 401);
  let date: string;
  try {
    const input = await body(request);
    if (!input || typeof input !== 'object' || !validDate((input as Record<string, unknown>).date))
      throw new Error('Enter a valid rest date.');
    date = (input as { date: string }).date;
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid rest day.' }, 400);
  }
  try {
    const { id } = await params;
    return json({ restDay: await addRestDay(user, id, date) }, 201);
  } catch (error) { return serverError(error); }
}

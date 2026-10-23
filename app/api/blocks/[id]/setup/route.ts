import { authenticated, body, json, serverError } from '../../../../../lib/api';
import { saveBlockSetup, userPlan } from '../../../../../lib/store';
import { centralToday } from '../../../../../lib/domain';
import { validateNewBlock } from '../../../../../lib/blocks';
import { setupIssues, validateSetup } from '../../../../../lib/setup';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in to load your setup.' }, 401);
  try {
    const { id } = await params;
    const { ownerId: _ownerId, ...block } = await userPlan(user, id);
    return json({ block });
  } catch (error) { return serverError(error); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticated();
  if (!user) return json({ error: 'Please sign in before saving your setup.' }, 401);
  let setup, version;
  try {
    const values = await body(request);
    setup = validateSetup(values.setup, centralToday());
    validateNewBlock({ raceName: setup.goal.name, raceDate: setup.goal.targetDate });
    if (!Number.isSafeInteger(values.version) || values.version < 1) throw new Error('Reload this draft before saving.');
    if (values.complete !== undefined && typeof values.complete !== 'boolean') throw new Error('Choose whether this setup is complete.');
    const issues = values.complete ? setupIssues(setup) : [];
    if (issues.length) return json({ error: issues[0].message, issues }, 400);
    version = values.version;
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid setup.' }, 400); }
  try { const { id } = await params; return json({ block: await saveBlockSetup(user, id, setup, version) }); }
  catch (error) { return serverError(error); }
}

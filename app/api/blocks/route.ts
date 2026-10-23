import { authenticated, body, json, serverError } from '../../../lib/api';
import { createBlock, loadBlockLibrary } from '../../../lib/store';
import { validateNewBlock } from '../../../lib/blocks';
import { setupIssues, validateSetup, type BlockSetup } from '../../../lib/setup';
import { centralToday } from '../../../lib/domain';
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
  let input, setup: BlockSetup | undefined;
  try {
    const values = await body(request);
    if (values.setup !== undefined) {
      setup = validateSetup(values.setup, centralToday());
      if (values.complete !== undefined && typeof values.complete !== 'boolean') throw new Error('Choose whether this setup is complete.');
      const issues = values.complete ? setupIssues(setup) : [];
      if (issues.length) return json({ error: issues[0].message, issues }, 400);
      input = validateNewBlock({ raceName: setup.goal.name, raceDate: setup.goal.targetDate });
    } else input = validateNewBlock(values);
  }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid block.' }, 400); }
  try { return json({ block: await createBlock(user, input, setup) }, 201); }
  catch (error) { return serverError(error); }
}

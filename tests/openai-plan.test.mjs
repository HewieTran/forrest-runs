import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOpenAIPlan, PlanProviderError } from '../lib/openai-plan.ts';
import { preparePlanner } from '../lib/planner.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { currentPlannerFixture, plannerFixture, responseFixture } from './planner-fixture.mjs';
const { input, output } = plannerFixture();
const config = { apiKey: 'synthetic-key', model: 'gpt-6-luna' };
test('Responses request uses strict structured output, minimal intake and no response storage', async () => {
  let body;
  const result = await requestOpenAIPlan(input, config, async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-key');
    body = JSON.parse(init.body);
    return Response.json(responseFixture(output));
  });
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal('tools' in body, false);
  assert.deepEqual(JSON.parse(body.input).intake, input);
  assert.equal('name' in JSON.parse(body.input).intake.goal, false);
  assert.deepEqual(result.output, output);
  assert.deepEqual(result.usage, { inputTokens: 1000, outputTokens: 2000 });
});

test('marathon request carries the exact race distance and assesses endurance separately from speed', async () => {
  const { setup } = currentPlannerFixture();
  setup.goal.distanceKm = 42.195;
  setup.goal.targetDurationSeconds = 14400;
  const marathon = preparePlanner(setup, setup.goal.startDate);
  const output = {
    ...simulatedPlan(marathon).output,
    assessment: { decision: 'proceed', reason: 'Synthetic response for request validation.', actions: [] },
  };
  await requestOpenAIPlan(marathon, config, async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(JSON.parse(body.input).intake.goal.distanceMeters, 42195);
    assert.match(body.instructions, /fixes race distance at Full marathon \(42195 meters\)/);
    assert.match(body.instructions, /assess endurance readiness separately from speed/);
    return Response.json(responseFixture(output));
  });
});
test('refusals, truncated or malformed output, upstream failures and timeouts never yield a plan', async () => {
  const cases = [
    [() => Response.json({ ...responseFixture(output), status: 'incomplete' }), 'incomplete'],
    [() => Response.json({ ...responseFixture(output), output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }), 'refusal'],
    [() => Response.json(responseFixture({ ...output, sessions: [] })), 'invalid'],
    [() => new Response('sensitive upstream body', { status: 429 }), 'rate_limit'],
    [() => new Response('not JSON'), 'invalid'],
    [() => { throw new DOMException('slow', 'TimeoutError'); }, 'timeout'],
  ];
  for (const [reply, code] of cases) await assert.rejects(requestOpenAIPlan(input, config, async () => reply()), error => error instanceof PlanProviderError && error.code === code && !error.message.includes('sensitive'));
  let called = false;
  await assert.rejects(requestOpenAIPlan(input, { ...config, apiKey: '' }, async () => { called = true; }), { code: 'configuration' });
  assert.equal(called, false);
});

test('one configured model is requested once, with no retries or model fallback on failures', async () => {
  for (const [status, code] of [[400,'request'],[401,'authentication'],[403,'model_access'],[429,'rate_limit'],[500,'provider'],[503,'provider']]) {
    const requestedModels = [];
    await assert.rejects(requestOpenAIPlan(input, { apiKey: 'synthetic-key', model: 'gpt-6-luna' }, async (_url, init) => {
      requestedModels.push(JSON.parse(init.body).model);
      return new Response('upstream failure', { status });
    }), { code });
    assert.deepEqual(requestedModels, ['gpt-6-luna']);
  }
  let requests = 0;
  await assert.rejects(requestOpenAIPlan(input, { apiKey: 'synthetic-key', model: '' }, async () => { requests++; }), { code: 'configuration' });
  assert.equal(requests, 0);
});

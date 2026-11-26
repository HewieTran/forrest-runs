import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOpenAIPlan, PlanProviderError } from '../lib/openai-plan.ts';
import { addDays } from '../lib/domain.ts';
import { preparePlanner } from '../lib/planner.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';
const { input, output } = currentPlannerFixture();
const config = { apiKey: 'synthetic-key', model: 'gpt-6-luna' };
test('an old valid result remains unchanged evidence in one best-effort provider request', async () => {
  const {setup} = currentPlannerFixture('2026-11-23');
  setup.benchmark.date='2024-01-01';
  const intake=preparePlanner(setup,'2026-11-23'), before=structuredClone(intake);
  const plan={...simulatedPlan(intake).output,assessment:{decision:'proceed',reason:'Synthetic conservative response with uncertain current fitness.',actions:[]}};
  let calls=0;
  const result=await requestOpenAIPlan(intake,{...config,asOfDate:'2026-11-23'},async (_url,init)=>{
    calls++;
    const request=JSON.parse(init.body),data=JSON.parse(request.input);
    assert.deepEqual(data.intake,before);
    assert.equal(data.intake.baseline.results[0].date,'2024-01-01');
    assert.match(request.instructions,/older result or unknown current workload alone must NOT trigger/);
    assert.match(request.instructions,/Do not invent a newer benchmark/);
    return Response.json(responseFixture(plan));
  });
  assert.equal(calls,1);assert.deepEqual(intake,before);
  assert.equal(result.output.outcome,'plan');
  assert.equal(result.promptVersion,'race-coach-v12-confirmed-goal');
});
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
    assert.match(body.instructions, /Explain the extra uncertainty about longer-distance endurance/);
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

test('provisional 5K request retains goal and unknown workload with an indirect half-marathon result', async () => {
  const today = '2026-11-24';
  const { setup } = currentPlannerFixture(today);
  setup.goal.targetDate = addDays(today, 91);
  setup.goal.targetDurationSeconds = 1710;
  setup.runner.experience = 'intermediate';
  setup.availability.days = [0, 2, 4];
  setup.benchmark = { distance: 'half', durationSeconds: 8940, date: addDays(today, -7), effortConfirmed: true };
  const intake = preparePlanner(setup, today), before = structuredClone(intake);
  const proposal = {
    ...simulatedPlan(intake).output,
    goalAssessment: 'The requested 28:30 remains an aspirational goal. The half-marathon result is indirect evidence.',
    assumptions: ['Current workload is unknown. Starting sessions use tentative paces and effort cues.'],
    assessment: { decision: 'proceed', reason: 'A provisional schedule can be proposed with uncertainty.', actions: [] },
  };
  let calls = 0;
  const result = await requestOpenAIPlan(intake, { ...config, asOfDate: today }, async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body), sent = JSON.parse(body.input);
    assert.deepEqual(sent.intake, before);
    assert.equal(sent.planningContext.trainingWindowDays, 91);
    assert.equal(sent.intake.baseline.weeklyDistanceMiles, null);
    assert.equal(sent.intake.baseline.longestRunMiles, null);
    assert.match(body.instructions, /unknown current workload alone must NOT trigger/);
    assert.match(body.instructions, /Progress suitable quality sessions toward the confirmed goal pace/);
    assert.match(body.instructions, /Preserve the exact accepted time, dates and weekdays/);
    return Response.json(responseFixture(proposal));
  });
  assert.equal(calls, 1);
  assert.equal(result.output.outcome, 'plan');
  assert.equal(result.output.assessment.decision, 'proceed');
  assert.equal(intake.goal.targetDurationSeconds, 1710);
  assert.deepEqual(intake, before);
  assert.equal(setup.goal.targetDurationSeconds, 1710);
  assert.equal(result.output.sessions.find(session => session.type === 'Race').steps[0].durationSeconds, 1710);
});

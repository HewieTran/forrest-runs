import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationCases, evaluateCases, EVALUATION_BUDGET } from '../scripts/evaluate-planner.mjs';
import { REQUEST_RESERVE_MICRODOLLARS } from '../lib/planner-policy.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { responseFixture } from './planner-fixture.mjs';
const today = '2026-10-31', cases = evaluationCases(today);

test('evaluation uses fixed synthetic current-intake profiles and a four-request worst-case budget', () => {
  assert.equal(cases.length, 4);
  assert.ok(cases.length * REQUEST_RESERVE_MICRODOLLARS <= EVALUATION_BUDGET);
  assert.equal(cases[1].input.runner.experience, 'novice');
  assert.equal(cases[1].input.baseline.results[0].durationSeconds, 2100);
  assert.equal(cases[1].input.goal.targetDurationSeconds, 900);
  assert.ok(cases.every(example => example.input.schemaVersion === 2 && example.input.goal.distanceMeters === 5000));
  assert.ok(cases.every(example => !('name' in example.input.goal)));
});

test('evaluation reserves before dispatch, records usage and stops after a failed expectation without retrying', async () => {
  const journal = { attempts: [] }, snapshots = [];
  let calls = 0;
  await evaluateCases({ cases, apiKey: 'synthetic', today, journal, persist: value => snapshots.push(structuredClone(value)), fetcher: async () => {
    assert.equal(snapshots.at(-1).attempts.at(-1).status, 'reserved');
    assert.equal(snapshots.at(-1).attempts.at(-1).countedMicrodollars, REQUEST_RESERVE_MICRODOLLARS);
    const output = { ...simulatedPlan(cases[calls++].input).output, assessment: { decision: 'proceed', reason: 'Synthetic fixture.', actions: [] } };
    return Response.json(responseFixture(output));
  } });
  assert.equal(calls, 2); assert.equal(journal.attempts[0].expectationMet, true);
  assert.equal(journal.attempts[1].expectationMet, false);
  assert.equal(journal.attempts[0].countedMicrodollars, 1100);
  assert.equal(journal.attempts[0].result.output.outcome, 'plan');
  assert.equal('candidate' in journal.attempts[0], false);
});

test('timeouts retain the reservation and stop; a reserved or dispatched case is never retried', async () => {
  const journal = { attempts: [] }; let calls = 0;
  const options = { cases: [cases[0]], apiKey: 'synthetic', today, journal, persist() {}, fetcher: async () => { calls++; throw new DOMException('synthetic timeout', 'TimeoutError'); } };
  await evaluateCases(options);
  assert.equal(journal.attempts[0].errorCode, 'timeout');
  assert.equal(journal.attempts[0].countedMicrodollars, REQUEST_RESERVE_MICRODOLLARS);
  await evaluateCases(options); assert.equal(calls, 1);
});

test('exhausted budget never dispatches, and provider error bodies are not saved', async () => {
  let calls = 0;
  const journal = { attempts: [{ id: 'earlier', countedMicrodollars: EVALUATION_BUDGET }] };
  await evaluateCases({ cases, apiKey: 'synthetic', today, journal, persist() {}, fetcher: async () => { calls++; } });
  assert.equal(calls, 0);
  const failed = { attempts: [] };
  await evaluateCases({ cases, apiKey: 'synthetic', today, journal: failed, persist() {}, fetcher: async () => new Response('sensitive upstream body', { status: 401 }) });
  assert.equal(failed.attempts.length, 1); assert.equal(failed.attempts[0].errorCode, 'authentication');
  assert.ok(!JSON.stringify(failed).includes('sensitive upstream body'));
});

test('a charged invalid schedule is retained only as a review candidate and stops the batch', async () => {
  const journal = { attempts: [] }; let calls = 0;
  const output = { ...simulatedPlan(cases[0].input).output, sessions: [], assessment: { decision: 'proceed', reason: 'Synthetic invalid schedule.', actions: [] } };
  await evaluateCases({ cases, apiKey: 'synthetic', today, journal, persist() {}, fetcher: async () => { calls++; return Response.json(responseFixture(output)); } });
  assert.equal(calls, 1); assert.equal(journal.attempts[0].status, 'failed');
  assert.equal(journal.attempts[0].errorCode, 'invalid');
  assert.deepEqual(journal.attempts[0].candidate, output);
  assert.equal(journal.attempts[0].countedMicrodollars, 1100);
  assert.equal('result' in journal.attempts[0], false);
});

import { providerOutput } from './planner-fixture.mjs';
import { calculatePlanMeasurements } from '../lib/planner-math.ts';
import { validatePlanOutput, preparePlanner } from '../lib/planner.ts';
// Offline replay of the recorded real-model outputs. Production Worker, temporary
// D1, synthetic owners/key and intercepted HTTP only. Never sends paid requests.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare, applyAllMigrations, createFetchMock } from './d1-helpers.mjs';
import { evaluationCases } from '../scripts/evaluate-planner.mjs';
import { centralToday, addDays, dateDiff } from '../lib/domain.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
const journal = JSON.parse(await readFile('evals/stage6-results.json', 'utf8'));
assert.equal(journal.synthetic, true); assert.equal(journal.attempts.length, 4);
const calculatedJournal = JSON.parse(await readFile('evals/calculated-plan-results.json', 'utf8'));
assert.equal(calculatedJournal.synthetic, true); assert.equal(calculatedJournal.attempts.length, 1);
const captures = [...journal.attempts, { ...calculatedJournal.attempts[0], sourceDate: calculatedJournal.asOfDate, setupSnapshot: calculatedJournal.setupSnapshot }];
const files = await readdir('dist/server', { recursive: true });
const modules = ['index.js', ...files.filter(file => file.endsWith('.js') && file !== 'index.js')].map(file => ({ type: 'ESModule', path: path.resolve('dist/server', file) }));
const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
const worker = new Miniflare({ modules, fetchMock, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], cf: false,
  d1Databases: { DB: 'recorded-live-output-tests-only' }, bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-luna' } });
try {
  const db = await worker.getD1Database('DB'); await applyAllMigrations(db);
  const today = centralToday(), cases = evaluationCases(journal.asOfDate);
  for (const recorded of captures) {
    assert.equal(recorded.status, 'completed'); assert.equal(recorded.expectationMet, true);
    // Whole weeks preserve the captured weekdays. A day-by-day shift would move
    // sessions off their selected days as soon as this replay runs on another day.
    const shift = Math.ceil(dateDiff(today, recorded.sourceDate ?? journal.asOfDate) / 7) * 7;
    const setup = structuredClone(recorded.setupSnapshot ?? cases.find(value => value.id === recorded.id).setup);
    setup.goal.startDate = addDays(setup.goal.startDate, shift); setup.goal.targetDate = addDays(setup.goal.targetDate, shift);
    setup.benchmark.date = addDays(setup.benchmark.date, shift);
    const example = { setup, input: preparePlanner(setup, today) };
    const result = recorded.result;
    // Rebase only calendar dates to keep the storage regression usable later.
    // This is not another model evaluation; assessment prose stays as captured.
    const originalOutput = { ...result.output, sessions: result.output.sessions.map(session => ({ ...session, date: addDays(session.date, shift) })) };
    // Adapt the old recorded response to the new pair-only wire contract. This
    // verifies storage/calculation compatibility, not a fresh paid model result.
    const wire = providerOutput(originalOutput);
    const output = validatePlanOutput(calculatePlanMeasurements(wire, example.input), example.input, true);
    const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'replay-' + recorded.id, 'oai-authenticated-user-email': 'replay@example.test' };
    const call = async (route, method = 'GET', body) => {
      const response = await worker.dispatchFetch('http://localhost' + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    };
    const created = await call('/api/blocks', 'POST', { setup: example.setup, complete: true }); assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.block.id, route = '/api/blocks/' + id;
    fetchMock.get('https://api.openai.com').intercept({ path: '/v1/responses', method: 'POST' }).reply(200, {
      id: 'recorded-response-' + recorded.id, model: result.model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(wire) }] }],
      usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens },
    });
    const generated = await call(route + '/generation', 'POST', { version: created.data.block.version, consent: true, saveImmediately: true });
    assert.equal(generated.status, 200, JSON.stringify(generated.data));
    const reloaded = (await call('/api/training?blockId=' + id)).data;
    assert.deepEqual(reloaded.plan.setup, example.setup);
    assert.deepEqual(reloaded.plan.generation.input, example.input);
    assert.deepEqual(reloaded.plan.generation.output, output);
    assert.deepEqual(reloaded.plan.generation.usage, result.usage);
    assert.equal(reloaded.plan.generation.calculationVersion, 'duration-pace-v1');
    assert.equal(reloaded.plan.generation.assessmentContext.asOfDate, today);
    if (output.outcome === 'plan') {
      assert.equal(reloaded.plan.generation.status, 'accepted'); assert.equal(reloaded.plan.status, 'draft');
      assert.equal(reloaded.workouts.length, output.sessions.length);
      assert.equal(reloaded.workouts.length + reloaded.restDays.length, dateDiff(example.input.goal.raceDate, example.input.goal.startDate) + 1);
      const repeated = await call(route + '/generation', 'POST', { version: 1, consent: true, saveImmediately: true });
      assert.equal(repeated.status, 200); assert.equal(repeated.data.block.generation.id, reloaded.plan.generation.id);
      assert.equal((await call('/api/training?blockId=' + id)).data.workouts.length, output.sessions.length);
    } else {
      assert.equal(reloaded.plan.generation.status, 'clarification'); assert.equal(reloaded.workouts.length, 0); assert.equal(reloaded.restDays.length, 0);
    }
    const backup = (await call('/api/export?blockId=' + id)).data;
    assert.deepEqual(normalizeTrainingBackup(backup), backup);
    console.log('PASS: recorded Luna ' + recorded.id + ' → validate → automatic save/clarification → reload → v6 backup; no external traffic.');
  }
} finally { await worker.dispose(); }

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { SignJWT } from 'jose';
import { openSQLite } from '../runtime/sqlite.mjs';
import { centralToday } from '../lib/domain.ts';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';
import { reviewSelection, seedReviewedFixture } from './goal-review-prerequisite.mjs';
import { testPlannerBudget } from './planner-budget-integration.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'forrest-generator-test-'));
const filename = path.join(directory, 'training.sqlite');
const replies = path.join(directory, 'replies.json');
const calls = path.join(directory, 'calls.jsonl');
writeFileSync(replies, '[]');
writeFileSync(calls, '');
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const issuer = 'https://issuer.example.test/pool';
const secret = 'synthetic-generator-session-key-0123456789';
const pilotOwners = ['pilot', 'timeout', 'billing', 'budget-a', 'budget-b', 'budget-success', 'budget-invalid', 'budget-rollback', 'budget-daily'];
const emails = pilotOwners.map(owner => `${owner}@example.test`);
const { setup, output } = currentPlannerFixture(centralToday());
let server, database, log = '';

async function start(overrides = {}) {
  server = spawn(process.execPath, process.env.FORREST_PACKAGED_ROOT
    ? ['tests/release-server.mjs'] : ['scripts/node-proof.mjs', 'start'], {
    env: {
      ...process.env, NODE_OPTIONS: '--import ./tests/node-generator-provider.mjs',
      FORREST_AWS_BETA: '1', FORREST_PROOF_PORT: String(port), FORREST_SQLITE_PATH: filename,
      FORREST_BETA_ORIGIN: 'https://beta.example.test', FORREST_COGNITO_DOMAIN: 'https://login.example.test',
      FORREST_COGNITO_ISSUER: issuer, FORREST_COGNITO_CLIENT_ID: 'fixture-client',
      FORREST_COGNITO_CLIENT_SECRET: 'fixture-secret', FORREST_BETA_SESSION_SECRET: secret,
      FORREST_BETA_ALLOWED_EMAILS: [...emails, 'other@example.test'].join(','),
      FORREST_LIVE_GENERATOR_ALLOWED_EMAILS: emails.map(email => ` ${email.toUpperCase()} `).join(','),
      TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-generator-key', OPENAI_PLAN_MODEL: 'gpt-6-luna',
      FORREST_TEST_RESPONSES: replies, FORREST_TEST_CALLS: calls, ...overrides,
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-12000); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch(base)).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Generator test server did not start');
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function cookie(owner) {
  const token = await new SignJWT({ email: `${owner}@example.test` })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(owner).setIssuer(issuer)
    .setAudience('session:fixture-client').setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  return `__Host-forrest-beta=${token}`;
}

async function request(owner, route, method = 'GET', body) {
  return fetch(base + route, {
    method, headers: { Cookie: await cookie(owner), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function create(owner, provider = 'openai') {
  const response = await request(owner, '/api/blocks', 'POST', { setup, complete: true });
  assert.equal(response.status, 201);
  const { block } = await response.json();
  await seedReviewedFixture(fixtureDb, block, provider);
  return block;
}
const generate = (owner, block, extra = {}) => request(owner, `/api/blocks/${block.id}/generation`, 'POST', {
  version: block.version, consent: true, saveImmediately: true, goalReview: reviewSelection(block.id), ...extra,
});
const dispatchCount = () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).length;
function resetData() {
  // This connection only ever points at the disposable mkdtemp database above.
  database.exec('DELETE FROM workouts; DELETE FROM training_rest_days; DELETE FROM training_plans; DELETE FROM training_ai_usage;');
}
function enqueue(status, body) {
  const queue = JSON.parse(readFileSync(replies, 'utf8'));
  queue.push({ status, body });
  writeFileSync(replies, JSON.stringify(queue));
}

const fixtureDb = { prepare(sql) {
    // The shared fixture names raw Worker identities in SQL; AWS scopes the
    // same fixture identities to Cognito subjects, including its failure trigger.
    sql = sql.replace(/owner_id='(budget-[a-z-]+)'/g, "owner_id='cognito:$1'");
    let params = [];
    const query = {
      bind(...values) { params = values; return query; },
      async first() { return database.prepare(sql).get(...params) ?? null; },
      async run() { return database.prepare(sql).run(...params); },
    };
    return query;
  } };

try {
  await start();
  database = openSQLite(filename);
  const a = await create('pilot');
  assert.equal((await generate('unknown', a)).status, 401);
  assert.equal((await generate('other', a)).status, 404);
  const other = await create('other', 'simulation');
  const simulated = await generate('other', other, { mode: 'openai', model: 'expensive-model' });
  assert.equal(simulated.status, 200);
  const sample = (await simulated.json()).block;
  assert.equal(sample.generation.provider, 'simulation');
  assert.equal((await request('other', `/api/blocks/${other.id}`, 'PATCH', { status: 'active', version: sample.version })).status, 409);
  assert.equal(dispatchCount(), 0);
  const sampleHtml = await (await request('other', `/blocks/${other.id}/setup`)).text();
  assert.match(sampleHtml, /Original plan details|Example paces/);
  const pilotHtml = await (await request('pilot', `/blocks/${a.id}/setup`)).text();
  assert.doesNotMatch(pilotHtml, /synthetic-generator-key|FORREST_LIVE_GENERATOR_ALLOWED_EMAILS|SIMULATION/);

  enqueue(200, responseFixture(output));
  const concurrent = await Promise.all([generate('pilot', a), generate('pilot', a)]);
  assert.ok(concurrent.every(response => [200, 409].includes(response.status)));
  const saved = (await concurrent.find(response => response.status === 200).json()).block;
  assert.equal(saved.generation.provider, 'openai');
  assert.equal(saved.generation.status, 'accepted');
  assert.equal(dispatchCount(), 1);
  const reopened = await (await request('pilot', `/api/training?blockId=${a.id}`)).json();
  assert.ok(reopened.workouts.length > 0);
  assert.equal((await generate('pilot', a)).status, 200);
  assert.equal(dispatchCount(), 1);
  const charge = database.prepare('SELECT * FROM training_ai_usage WHERE id=?').get(saved.generation.id);
  assert.equal(charge.status, 'settled');
  assert.equal(charge.charged_microdollars, 1100);
  assert.equal((await request('pilot', `/api/blocks/${a.id}`, 'PATCH', { status: 'active', version: saved.version })).status, 200);
  assert.equal((await request('other', `/api/training?blockId=${a.id}`)).status, 404);
  const backup = await (await request('pilot', '/api/export')).text();
  assert.doesNotMatch(backup, /synthetic-generator-key|fixture-secret|training_ai_usage/);

  const timeout = await create('timeout');
  writeFileSync(replies, JSON.stringify([{ timeout: true }]));
  const timeoutResponse = await generate('timeout', timeout);
  assert.equal(timeoutResponse.status, 502);
  assert.equal((await timeoutResponse.json()).errorCode, 'timeout');
  assert.equal(database.prepare("SELECT status FROM training_ai_usage WHERE owner_id='cognito:timeout'").get().status, 'uncertain');
  const rejected = await create('billing');
  enqueue(429, { error: { code: 'project_spend_limit_exceeded', message: 'private-provider-detail' } });
  const billing = await generate('billing', rejected);
  assert.equal(billing.status, 503);
  assert.equal((await billing.json()).errorCode, 'billing');
  assert.equal(database.prepare("SELECT charged_microdollars FROM training_ai_usage WHERE owner_id='cognito:billing'").get().charged_microdollars, 0);

  // Run the same accounting cases as the Worker suite against real SQLite and
  // authenticated AWS HTTP routes. Provider replies cross a test-only file queue.
  resetData();
  const mock = {
    get(origin) {
      assert.equal(origin, 'https://api.openai.com');
      return { intercept(options) {
        assert.equal(options.path, '/v1/responses');
        return { reply: enqueue };
      } };
    },
    assertNoPendingInterceptors() { assert.deepEqual(JSON.parse(readFileSync(replies, 'utf8')), []); },
  };
  await testPlannerBudget(fixtureDb, async (input, init) => {
    const headers = new Headers(init?.headers);
    const owner = headers.get('oai-authenticated-user-id');
    headers.delete('oai-authenticated-user-id');
    headers.delete('oai-authenticated-user-email');
    headers.set('Cookie', await cookie(owner));
    const url = new URL(input);
    return fetch(base + url.pathname + url.search, { ...init, headers });
  }, mock);

  const before = dispatchCount();
  for (const overrides of [
    { FORREST_LIVE_GENERATOR_ALLOWED_EMAILS: '' },
    { TRAINING_PLANNER_MODE: 'simulation' },
    { TRAINING_PLANNER_MODE: undefined },
    { TRAINING_PLANNER_MODE: '' },
    { OPENAI_API_KEY: '' },
    { OPENAI_PLAN_MODEL: 'unapproved-model' },
  ]) {
    await stop();
    resetData();
    await start(overrides);
    const simulated = overrides.FORREST_LIVE_GENERATOR_ALLOWED_EMAILS === '' || overrides.TRAINING_PLANNER_MODE === 'simulation'
      || (Object.hasOwn(overrides, 'TRAINING_PLANNER_MODE') && overrides.TRAINING_PLANNER_MODE === undefined);
    const draft = await create('pilot', simulated ? 'simulation' : 'openai');
    const response = await generate('pilot', draft);
    if (simulated) {
      assert.equal(response.status, 200);
      assert.equal((await response.json()).block.generation.provider, 'simulation');
    } else {
      assert.equal(response.status, 503);
      assert.equal(database.prepare('SELECT generation FROM training_plans WHERE id=?').get(draft.id).generation, null);
      const html = await (await request('pilot', `/blocks/${draft.id}/setup`)).text();
      assert.match(html, /Plan generation is currently unavailable/);
    }
    assert.equal(dispatchCount(), before);
  }
  assert.doesNotMatch(log, /synthetic-generator-key|private-provider-detail/);
  console.log('PASS: AWS pilot isolation, simulated fallback, exact model, paid accounting, autosave/reload/start, timeout, billing and rollback configuration. No real API requests.');
} catch (error) {
  console.error(log);
  throw error;
} finally {
  await stop();
  database?.close();
  rmSync(directory, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { centralToday, addDays } from '../lib/domain.ts';
import { currentPlannerFixture } from './planner-fixture.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'forrest-onboarding-'));
const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let log = '';
const server = spawn(process.execPath, ['scripts/node-proof.mjs', 'start'], { env: {
  ...process.env, FORREST_SQLITE_PATH: path.join(directory, 'training.sqlite'), FORREST_PROOF_PORT: String(port),
  FORREST_PROOF_SESSION_SECRET: randomBytes(32).toString('hex'),
}, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => { log = (log + chunk).slice(-10000); });
server.stderr.on('data', chunk => { log = (log + chunk).slice(-10000); });
async function login(runner) {
  const r = await fetch(origin + '/node-proof-login', { method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ runner }) });
  assert.equal(r.status, 303); return r.headers.get('set-cookie').split(';')[0];
}
async function call(cookie, route, method = 'GET', body) {
  const r = await fetch(origin + route, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
async function html(cookie, route = '/') {
  const r = await fetch(origin + route, { headers: { Cookie: cookie }, redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location'), text: (await r.text()).replaceAll('<!-- -->', '') };
}
function selected(text, label) { assert.match(text, new RegExp('aria-pressed="true"[^>]*>' + label + '<span>')); }
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin)).status === 200) break; } catch {}
    if (Date.now() > deadline) throw Error('Server startup timeout: ' + log);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const a = await login('a'), b = await login('b'), today = centralToday();
  const empty = await html(a); selected(empty.text, 'All blocks'); assert.match(empty.text, /No training blocks yet/);
  const created = await call(a, '/api/blocks', 'POST', { raceName: 'Future onboarding plan', raceDate: addDays(today, 60) });
  assert.equal(created.status, 201); const plan = created.data.block, scope = '?blockId=' + plan.id;
  selected((await html(a)).text, 'Draft');
  const workout = { date: addDays(today, 3), phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Synthetic future run', targetPace: '', done: false,
    actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', version: 1,
    plannedDistance: 3, plannedDurationSeconds: 1800, plannedPaceSecondsPerMile: 600, targetMetric: 'distance' };
  const added = await call(a, '/api/workouts' + scope, 'POST', workout); assert.equal(added.status, 201);
  const readyPage = await html(a); selected(readyPage.text, 'Not started'); assert.match(readyPage.text, /Training starts in 3 days/); assert.match(readyPage.text, /Start this block/);
  await call(a, '/api/blocks', 'POST', { raceName: 'Unfinished onboarding draft', raceDate: addDays(today, 80) });
  selected((await html(a)).text, 'Not started');
  const explicit = await html(a, '/blocks?status=draft&q=Unfinished'); selected(explicit.text, 'Draft'); assert.match(explicit.text, /Unfinished onboarding draft/); assert.doesNotMatch(explicit.text, /<h2><a[^>]*>Future onboarding plan/);
  selected((await html(a, '/blocks?status=archived&q=missing')).text, 'Archived');
  assert.match((await html(a, '/blocks?status=archived&q=missing')).text, /No archived blocks/);
  const before = (await call(a, '/api/training' + scope)).data;
  const overview = await html(a, '/blocks/' + plan.id); assert.match(overview.text, /Your training block is ready/); assert.match(overview.text, /Keep for later/); assert.match(overview.text, /href="\/blocks\?status=ready"/);
  assert.equal((await call(a, '/api/training' + scope)).data.plan.status, 'draft');
  assert.equal((await call(b, '/api/blocks/' + plan.id, 'PATCH', { status: 'active', version: plan.version })).status, 404);
  const started = await call(a, '/api/blocks/' + plan.id, 'PATCH', { status: 'active', version: before.plan.version }); assert.equal(started.status, 200);
  const after = (await call(a, '/api/training' + scope)).data;
  assert.deepEqual(after.workouts, before.workouts); assert.deepEqual(after.restDays, before.restDays); assert.equal(after.plan.status, 'active');
  const home = await html(a); assert.ok(home.location === '/blocks/' + plan.id || home.text.includes('url=/blocks/' + plan.id));
  selected((await html(a, '/?status=draft')).text, 'Draft');
  const startedOverview = await html(a, '/blocks/' + plan.id); assert.doesNotMatch(startedOverview.text, /Your training block is ready/); assert.match(startedOverview.text, /Training starts in 3 days/);
  const second = (await call(a, '/api/blocks', 'POST', { raceName: 'Another ready block', raceDate: addDays(today, 90) })).data.block;
  await call(a, '/api/workouts?blockId=' + second.id, 'POST', workout);
  assert.equal((await call(a, '/api/blocks/' + second.id, 'PATCH', { status: 'active', version: second.version })).status, 409);
  assert.equal((await call(a, '/api/training?blockId=' + second.id)).data.plan.status, 'draft');
  const archived = await call(a, '/api/blocks/' + plan.id, 'PATCH', { status: 'archived', version: after.plan.version }); assert.equal(archived.status, 200);
  const stale = await call(a, '/api/blocks/' + plan.id, 'PATCH', { status: 'draft', version: after.plan.version }); assert.equal(stale.status, 409);
  const completedSecond = await call(a, '/api/blocks/' + second.id, 'PATCH', { status: 'archived', version: second.version }); assert.equal(completedSecond.status, 200);
  const all = (await call(a, '/api/blocks')).data.blocks;
  for (const p of all.filter(p => p.status === 'draft')) assert.equal((await call(a, '/api/blocks/' + p.id, 'PATCH', { status: 'archived', version: p.version })).status, 200);
  const history = await html(a); selected(history.text, 'All blocks'); assert.match(history.text, /Ready for your next goal/); assert.doesNotMatch(history.text, /No training blocks yet/);
  const { setup } = currentPlannerFixture(today);
  setup.runner.age = null;
  const savedDraft = await call(a, '/api/blocks', 'POST', { setup, complete: false });
  assert.equal(savedDraft.status, 201);
  const draftPath = '/api/blocks/' + savedDraft.data.block.id;
  const reloadedDraft = await call(a, '/api/training?blockId=' + savedDraft.data.block.id);
  assert.equal(reloadedDraft.data.plan.setup.runner.age, null);
  const completedSetup = await call(a, draftPath + '/setup', 'PUT', { setup, complete: true, version: reloadedDraft.data.plan.version });
  assert.equal(completedSetup.status, 200);
  const guided = completedSetup.data.block;
  const reviewed = await call(a, '/api/blocks/' + guided.id + '/goal-review', 'POST', { version: guided.version, consent: true });
  assert.equal(reviewed.status, 200);
  const generation = await call(a, '/api/blocks/' + guided.id + '/generation', 'POST', {
    version: reviewed.data.block.version, consent: true, saveImmediately: true,
    goalReview: { reviewId: reviewed.data.block.goalReview.id, option: null },
  });
  assert.equal(generation.status, 200); assert.equal(generation.data.block.generation.provider, 'simulation');
  assert.equal(generation.data.block.generation.input.runner.age, null);
  assert.equal((await call(a, '/api/blocks/' + guided.id, 'PATCH', { status: 'active', version: generation.data.block.version })).status, 409);
  const samplePath = '/blocks/' + guided.id;
  const simulation = await html(a, samplePath);
  assert.match(simulation.text, /Sample plan/);
  assert.match(simulation.text, new RegExp(`href="${samplePath}/schedule">View sample schedule`));
  assert.doesNotMatch(simulation.text, /Your training block is ready|Start this block/);
  assert.match((await html(a, samplePath + '/schedule')).text, /Back to sample plan/);
  const snapshot = await html(a, samplePath + '/setup');
  assert.match(snapshot.text, /Original plan details/);
  assert.match(snapshot.text, /read-only snapshot/);
  assert.doesNotMatch(snapshot.text, /Save draft|Generate sample plan/);
  assert.ok((await call(a, '/api/training?blockId=' + guided.id)).data.workouts.length > 0);
  assert.deepEqual((await call(b, '/api/blocks')).data.blocks, []); selected((await html(b)).text, 'All blocks');
  console.log('PASS: native onboarding Home states, explicit filters/search, saved ready overview/Keep, activation before future workout without data changes, Home return, account isolation, active/stale conflicts, historical return, and saved unstartable simulation.');
} catch (error) { console.error(log); throw error; }
finally {
  if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); const timeout = setTimeout(() => server.kill('SIGKILL'), 10000); try { await exited; } finally { clearTimeout(timeout); } }
  rmSync(directory, { recursive: true, force: true });
}

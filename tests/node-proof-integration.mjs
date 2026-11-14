import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openSQLite } from '../runtime/sqlite.mjs';
import { currentPlannerFixture } from './planner-fixture.mjs';
import { centralToday, addDays } from '../lib/domain.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'forrest-node-app-'));
const filename = path.join(directory, 'training.sqlite');
const secret = randomBytes(32).toString('hex');
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const base = 'http://127.0.0.1:' + port;
let server;
let log = '';

async function startServer() {
  server = spawn(process.execPath, ['scripts/node-proof.mjs', 'start'], {
    env: { ...process.env, FORREST_SQLITE_PATH: filename, FORREST_PROOF_PORT: String(port),
      FORREST_PROOF_SESSION_SECRET: secret },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { log = (log + chunk).slice(-12000); });
  server.stderr.on('data', chunk => { log = (log + chunk).slice(-12000); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(base)).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Node server did not start. ' + log);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 10000);
  try { await exited; } finally { clearTimeout(timeout); }
}

async function login(runner) {
  const response = await fetch(base + '/node-proof-login', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ runner }),
  });
  assert.equal(response.status, 303, await response.text());
  return response.headers.get('set-cookie').split(';')[0];
}

async function call(cookie, route, method = 'GET', body) {
  const response = await fetch(base + route, {
    method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

try {
  await startServer();
  assert.equal((await fetch(base + '/api/blocks')).status, 401);
  assert.equal((await fetch(base + '/api/blocks', { headers: {
    'oai-authenticated-user-id': 'node-proof-a', 'oai-authenticated-user-email': 'runner-a@example.test',
  } })).status, 401);
  const a = await login('a'), b = await login('b');
  assert.equal((await call(a + 'x', '/api/blocks')).status, 401);
  assert.deepEqual((await call(a, '/api/blocks')).data.blocks, []);
  assert.deepEqual((await call(b, '/api/blocks')).data.blocks, []);
  const day = centralToday();
  const created = await call(a, '/api/blocks', 'POST', { raceName: 'Native Node training', raceDate: addDays(day, 60) });
  assert.equal(created.status, 201);
  const id = created.data.block.id, scope = '?blockId=' + id;
  const started = await call(a, '/api/blocks/' + id, 'PATCH', { status: 'active', version: created.data.block.version });
  assert.equal(started.status, 200);
  const home = await fetch(base, { headers: { Cookie: a }, redirect: 'manual' });
  const homeHtml = await home.text();
  assert.ok(home.headers.get('location') === '/blocks/' + id || homeHtml.includes('url=/blocks/' + id),
    'Home must redirect to the active block through HTTP or the streamed redirect meta tag.');
  assert.equal((await call(b, '/api/training' + scope)).status, 404);
  assert.equal((await call(b, '/api/export' + scope)).status, 404);

  const blockPage = () => fetch(base + '/blocks/' + id, { headers: { Cookie: a } }).then(async response => (await response.text()).replaceAll('<!-- -->', ''));
  assert.match(await blockPage(), /<h1 id="today-workout-title" tabindex="-1">No workout scheduled<\/h1>/);
  const restToday = await call(a, '/api/blocks/' + id + '/rest-days', 'POST', { date: day });
  assert.equal(restToday.status, 201);
  assert.match(await blockPage(), /<h1 id="today-workout-title" tabindex="-1">Rest day<\/h1>/);
  assert.equal((await call(a, '/api/blocks/' + id + '/rest-days/' + restToday.data.restDay.id, 'DELETE', { version: restToday.data.restDay.version })).status, 200);

  const workout = { date: day, phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Synthetic easy run',
    targetPace: '', done: false, actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', version: 1,
    plannedDistance: 5, plannedDurationSeconds: 3000, plannedPaceSecondsPerMile: 600, targetMetric: 'distance' };
  const added = await call(a, '/api/workouts' + scope, 'POST', workout);
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const plannedPage = await blockPage();
  assert.match(plannedPage, /<h1 id="today-workout-title" tabindex="-1">Easy run<\/h1>/);
  assert.match(plannedPage, /aria-label="Log Easy run workout"/);
  assert.match(plannedPage, /No recorded mileage/);
  assert.match(plannedPage, /of 5 mi planned/);
  const mobility = await call(a, '/api/workouts' + scope, 'POST', {
    ...workout, type: 'Mobility', plannedWorkout: 'Synthetic mobility',
    plannedDistance: null, plannedDurationSeconds: null, plannedPaceSecondsPerMile: null, targetMetric: null,
  });
  assert.equal(mobility.status, 201);
  const multiplePage = await blockPage();
  assert.match(multiplePage, /aria-label="Other workouts today"/);
  assert.match(multiplePage, /aria-label="Log Mobility workout"/);
  const route = '/api/workouts/' + added.data.workout.id + scope;
  const done = await call(a, route, 'PATCH', { ...added.data.workout, done: true });
  assert.equal(done.status, 200);
  assert.equal(done.data.workout.actualDistance, 5);
  const unchecked = await call(a, route, 'PATCH', { ...done.data.workout, done: false });
  assert.equal(unchecked.status, 200);
  assert.equal(unchecked.data.workout.actualDistance, null);
  const manual = await call(a, route, 'PATCH', { ...unchecked.data.workout, done: true, actualDistance: 4.5,
    manualResultFields: ['actualDistance'], notes: 'Persisted on native SQLite' });
  assert.equal(manual.status, 200);
  assert.equal((await call(a, route, 'PATCH', { ...added.data.workout, done: true })).status, 409);
  assert.equal((await call(b, route, 'PATCH', manual.data.workout)).status, 404);
  assert.equal((await call(a, '/api/blocks/' + id + '/rest-days', 'POST', { date: addDays(day, 1) })).status, 201);
  assert.equal((await call(a, '/api/blocks/' + id + '/rest-days', 'POST', { date: day })).status, 409);
  const detail = await blockPage();
  assert.match(detail, /Weekly workout tracker/);
  assert.match(detail, /aria-label="Edit Easy run workout"/);
  assert.match(detail, /aria-valuetext="4.5 of 5 miles planned"/);
  assert.doesNotMatch(detail, /Good miles today/);
  const progressPage = await fetch(base + '/blocks/' + id + '/progress', { headers: { Cookie: a } });
  assert.match(await progressPage.text(), /Weekly mileage/);
  const saved = (await call(a, '/api/training' + scope)).data;
  assert.equal(saved.workouts[0].actualDistance, 4.5);
  assert.equal(saved.restDays.length, 1);
  const backup = (await call(a, '/api/export')).data;
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  assert.deepEqual((await call(b, '/api/export')).data.blocks, []);
  console.log('PASS: native HTTP sign-in, account isolation, create/start, logging, unchecking, stale edits, rest days and backup export.');

  const guided = await call(a, '/api/blocks', 'POST', { setup: currentPlannerFixture(day).setup, complete: true });
  assert.equal(guided.status, 201);
  const guidedId = guided.data.block.id;
  const generated = await call(a, '/api/blocks/' + guidedId + '/generation', 'POST', {
    version: guided.data.block.version, consent: true, saveImmediately: true,
  });
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  assert.equal(generated.data.block.generation.provider, 'simulation');
  assert.equal(generated.data.block.generation.status, 'accepted');
  const generatedSaved = (await call(a, '/api/training?blockId=' + guidedId)).data;
  assert.ok(generatedSaved.workouts.length > 0);
  assert.ok(generatedSaved.restDays.length > 0);
  const retry = await call(a, '/api/blocks/' + guidedId + '/generation', 'POST', {
    version: guided.data.block.version, consent: true, saveImmediately: true,
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.block.generation.id, generated.data.block.generation.id);
  assert.deepEqual((await call(a, '/api/training?blockId=' + guidedId)).data.workouts, generatedSaved.workouts);
  console.log('PASS: the native app generates a simulated numeric plan, saves/reloads its schedule and handles a repeated request without duplicates.');

  const db = openSQLite(filename);
  try {
    for (const blockId of ['legacy:literal%3A', 'legacy:literal%25', 'legacy:space and +?/#é']) {
      db.prepare("INSERT INTO training_plans (id,owner_id,status,race_name,race_date,pace_guide,created_at,updated_at) VALUES (?,'node-proof-a','draft','Encoded proof','2027-05-01','[]',?,?)")
        .run(blockId, new Date().toISOString(), new Date().toISOString());
      const page = await fetch(base + '/blocks/' + encodeURIComponent(blockId), { headers: { Cookie: a } });
      assert.match(await page.text(), /Weekly workout tracker/);
    }
    db.exec(`CREATE TRIGGER node_proof_delete_failure BEFORE DELETE ON training_plans WHEN OLD.id = '${guidedId}' BEGIN SELECT RAISE(ABORT, 'proof rollback'); END`);
    const preview = (await call(a, '/api/blocks/' + guidedId)).data.deletion;
    const failed = await call(a, '/api/blocks/' + guidedId, 'DELETE', {
      version: preview.version, confirmation: preview.name, revision: preview.revision,
    });
    assert.equal(failed.status, 500);
    assert.deepEqual((await call(a, '/api/training?blockId=' + guidedId)).data, generatedSaved);
    db.exec('DROP TRIGGER node_proof_delete_failure');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
  console.log('PASS: encoded legacy block IDs load correctly and a late deletion failure rolls back the complete native SQLite batch.');

  await stopServer();
  await startServer();
  assert.deepEqual((await call(a, '/api/training' + scope)).data, saved);
  assert.deepEqual((await call(a, '/api/training?blockId=' + guidedId)).data, generatedSaved);
  assert.deepEqual((await call(b, '/api/blocks')).data.blocks, []);
  console.log('PASS: training data survives a full Node server restart in the standalone SQLite file.');
} catch (error) {
  console.error(log);
  throw error;
} finally {
  await stopServer();
  rmSync(directory, { recursive: true, force: true });
}

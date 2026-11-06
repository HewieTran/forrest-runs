import assert from 'node:assert/strict';
import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare, applyAllMigrations, createFetchMock } from './d1-helpers.mjs';
import { testPlanner } from './planner-integration.mjs';

// Runs the production Worker against disposable storage. No runtime secrets,
// workbook imports, real API credentials or network access are used.
try { await access('dist/server/index.js'); }
catch { throw new Error('Build the app before running planner integration tests.'); }
const serverFiles = await readdir('dist/server', { recursive: true });
const modules = ['index.js', ...serverFiles.filter(file => file.endsWith('.js') && file !== 'index.js')]
  .map(file => ({ type: 'ESModule', path: path.resolve('dist/server', file) }));
const fetchMock = createFetchMock();
fetchMock.disableNetConnect();
const options = { modules, fetchMock, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], cf: false,
  d1Databases: { DB: 'planner-tests-only' } };
const worker = new Miniflare({ ...options, bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-luna' } });
try {
  const db = await worker.getD1Database('DB');
  await applyAllMigrations(db);
  await testPlanner(db, (input, init) => worker.dispatchFetch(input, init), fetchMock);
} finally { await worker.dispose(); }

// Missing configuration must fail before any generation state or schedule write.
// An unmatched outbound request would also fail because network access is denied.
const unconfigured = new Miniflare(options);
try {
  const db = await unconfigured.getD1Database('DB');
  await applyAllMigrations(db);
  const { plannerFixture } = await import('./planner-fixture.mjs');
  const { centralToday } = await import('../lib/domain.ts');
  const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'unconfigured-test', 'oai-authenticated-user-email': 'test@example.test' };
  const create = await unconfigured.dispatchFetch('http://localhost/api/blocks', { method: 'POST', headers, body: JSON.stringify({ setup: plannerFixture(centralToday()).setup, complete: true }) });
  assert.equal(create.status, 201);
  const { block } = await create.json();
  const response = await unconfigured.dispatchFetch(`http://localhost/api/blocks/${block.id}/generation`, { method: 'POST', headers, body: JSON.stringify({ version: block.version, consent: true }) });
  assert.equal(response.status, 503);
  const saved = await db.prepare('SELECT setup, generation, version FROM training_plans WHERE id = ?').bind(block.id).first();
  assert.deepEqual(JSON.parse(saved.setup), block.setup);
  assert.equal(saved.generation, null);
  assert.equal(saved.version, block.version);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM workouts').first()).count, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM training_rest_days').first()).count, 0);
  console.log('PASS: no API configuration requires no real credentials, makes no provider request, and preserves the intake and empty schedule.');
} finally { await unconfigured.dispose(); }
console.log('PASS: planner integration uses synthetic inputs, temporary databases and intercepted provider responses only.');

// The deployed simulation branch must work without credentials. No provider
// interceptors are installed: any outbound request would fail the test.
const simulation = new Miniflare({ ...options, bindings: { TRAINING_PLANNER_MODE: 'simulation' } });
try {
  const db = await simulation.getD1Database('DB');
  await applyAllMigrations(db);
  const { testSimulation } = await import('./simulation-integration.mjs');
  await testSimulation(db, (input, init) => simulation.dispatchFetch(input, init));
} finally { await simulation.dispose(); }

// Numeric intake is also exercised through the existing provider adapter using
// an intercepted synthetic response. No external request or real key is used.
const numeric = new Miniflare({ ...options, bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-luna' } });
try {
 const db=await numeric.getD1Database('DB');await applyAllMigrations(db);
 const { simpleSetup }=await import('../lib/setup.ts');const { centralToday,addDays }=await import('../lib/domain.ts');
 const { preparePlanner }=await import('../lib/planner.ts');const { simulatedPlan }=await import('../lib/simulated-plan.ts');
 const { responseFixture }=await import('./planner-fixture.mjs');const { testPhaseOne }=await import('./phase-one-integration.mjs');
 const today=centralToday(),setup=simpleSetup(undefined,'',addDays(today,28),today);
 setup.step=3;setup.goal.targetDurationSeconds=1801;setup.runner={...setup.runner,experience:'novice',age:35,height:68,weight:150};setup.availability.days=[1,3,6];
 setup.benchmark={distance:'5k',durationSeconds:2100,date:today,effortConfirmed:true};
 const output={...simulatedPlan(preparePlanner(setup,today)).output,assessment:{decision:'proceed',reason:'Synthetic provider fixture, not a training judgment.',actions:[]}};
 fetchMock.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(200,responseFixture(output));
 await testPhaseOne(db,(input,init)=>numeric.dispatchFetch(input,init),'openai');
}finally{await numeric.dispose();}

const accounting = new Miniflare({ ...options, bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-luna' } });
try {
  const db = await accounting.getD1Database('DB'); await applyAllMigrations(db);
  const { testPlannerBudget } = await import('./planner-budget-integration.mjs');
  await testPlannerBudget(db, (input, init) => accounting.dispatchFetch(input, init), fetchMock);
} finally { await accounting.dispose(); }

const restricted = new Miniflare({ ...options, bindings: { TRAINING_PLANNER_MODE: 'openai', OPENAI_API_KEY: 'synthetic-key', OPENAI_PLAN_MODEL: 'gpt-6-astra' } });
try {
  const db = await restricted.getD1Database('DB'); await applyAllMigrations(db);
  const { plannerFixture } = await import('./planner-fixture.mjs');
  const { centralToday } = await import('../lib/domain.ts');
  const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'restricted-model', 'oai-authenticated-user-email': 'restricted@example.test' };
  const create = await restricted.dispatchFetch('http://localhost/api/blocks', { method: 'POST', headers, body: JSON.stringify({ setup: plannerFixture(centralToday()).setup, complete: true }) });
  const { block } = await create.json();
  const denied = await restricted.dispatchFetch(`http://localhost/api/blocks/${block.id}/generation`, { method: 'POST', headers, body: JSON.stringify({ version: block.version, consent: true }) });
  assert.equal(denied.status, 503); assert.equal((await denied.json()).errorCode, 'model_restricted');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM training_ai_usage').first()).n, 0);
  assert.equal((await db.prepare('SELECT generation FROM training_plans WHERE id=?').bind(block.id).first()).generation, null);
  console.log('PASS: a disallowed server model cannot create an attempt or call a provider.');
} finally { await restricted.dispose(); }

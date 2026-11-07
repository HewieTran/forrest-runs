import assert from 'node:assert/strict';
import { insertExistingTestBlock } from './d1-helpers.mjs';
import { currentPlannerFixture as plannerFixture } from './planner-fixture.mjs';
import { centralToday } from '../lib/domain.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { testRestore } from './blocks-integration.mjs';

export async function testSimulation(db, dispatch) {
  const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'simulation-owner', 'oai-authenticated-user-email': 'simulation@example.test' };
  async function call(path, method = 'GET', body) {
    const response = await dispatch('http://localhost' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  await insertExistingTestBlock(db, headers);
  const original = (await call('/api/training')).data.plan;
  const created = await call('/api/blocks', 'POST', { setup: plannerFixture(centralToday()).setup, complete: true });
  assert.equal(created.status, 201);
  const path = '/api/blocks/' + created.data.block.id;
  const page = await dispatch('http://localhost/blocks/' + created.data.block.id + '/plan', { headers });
  const html = await page.text();
  assert.match(html, /Generate plan/);
  assert.match(html, /No AI calls or API charges/);
  const generated = await call(path + '/generation', 'POST', { version: created.data.block.version, consent: true, mode: 'openai', model: 'expensive-model' });
  assert.equal(generated.status, 200);
  const block = generated.data.block;
  assert.equal(block.generation.provider, 'simulation');
  assert.equal(block.generation.model, 'simulated-5k-v1');
  assert.equal(block.generation.usage, null);
  assert.equal((await call('/api/training?blockId=' + block.id)).data.workouts.length, 0);
  const accepted = await call(path + '/generation/accept', 'POST', { version: block.version, generationId: block.generation.id });
  assert.equal(accepted.status, 200);
  const data = (await call('/api/training?blockId=' + block.id)).data;
  assert.equal(data.plan.status, 'draft');
  assert.equal(data.plan.generation.provider, 'simulation');
  assert.ok(data.workouts.length);
  assert.ok(data.workouts.every(w => w.plannedWorkout.includes('SIMULATION') && w.originalSource.provider === 'simulation'));
  assert.equal((await call('/api/blocks/' + original.id, 'PATCH', { status: 'completed', version: original.version })).status, 200);
  assert.equal((await call(path, 'PATCH', { status: 'active', version: data.plan.version })).status, 409);
  const card = (await call('/api/blocks')).data.blocks.find(b => b.id === block.id);
  assert.equal(card.isSimulation, true);
  const blockPage = await dispatch('http://localhost/blocks/' + block.id, { headers });
  const text = await blockPage.text();
  assert.match(text, /SIMULATION/);
  assert.doesNotMatch(text, /Activate block/);
  const backup = (await call('/api/export?blockId=' + block.id)).data;
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  await testRestore(backup);
  console.log('PASS: deployed simulation path needs no API key, ignores client model overrides, labels saved schedules/backups, and rejects activation.');
}

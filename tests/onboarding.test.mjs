import test from 'node:test';
import assert from 'node:assert/strict';
import { blockReady } from '../lib/blocks.ts';
import { landingFilter, libraryFilter, trainingStartLabel, guidanceSessionKey, GUIDANCE_PREFIX, clearGuidanceSession } from '../lib/onboarding.ts';

const block = (status, extra = {}) => ({ id: status, status, raceName: 'Synthetic block', raceDate: '2027-01-31',
  workoutCount: 0, completedCount: 0, recordedMiles: 0, firstWorkoutDate: null, lastWorkoutDate: null, ...extra });
const ready = block('draft', { id: 'ready', hasGeneratedPlan: true });
const draft = block('draft', { hasSetup: true });

test('landing resolves active, then ready, then incomplete draft, then account history/empty', () => {
  assert.equal(landingFilter([]), 'all');
  assert.equal(landingFilter([draft]), 'draft');
  assert.equal(landingFilter([ready]), 'ready');
  assert.equal(landingFilter([draft, ready]), 'ready');
  assert.equal(landingFilter([block('completed'), block('archived')]), 'all');
  assert.equal(landingFilter([block('archived')]), 'all');
  assert.equal(landingFilter([draft, ready, block('active')]), 'active');
});
test('reuse readiness for legacy manual and simulated schedules without changing stored statuses', () => {
  const manual = block('draft', { workoutCount: 5 });
  const incomplete = block('draft', { hasSetup: true, workoutCount: 5 });
  const simulated = { ...ready, isSimulation: true };
  assert.equal(blockReady(manual), true);
  assert.equal(blockReady(incomplete), false);
  assert.equal(landingFilter([manual]), 'ready');
  assert.equal(landingFilter([incomplete]), 'draft');
  assert.equal(landingFilter([simulated]), 'ready');
  assert.equal(simulated.status, 'draft');
});
test('explicit URL selections are validated independently of the account landing default', () => {
  for (const filter of ['all', 'draft', 'ready', 'active', 'completed', 'archived']) assert.equal(libraryFilter(filter), filter);
  for (const invalid of ['Not started', 'unknown', ['ready', 'draft'], null, undefined]) assert.equal(libraryFilter(invalid), null);
  const allOwnedBlocks = [draft, ready];
  assert.equal(libraryFilter('archived') ?? landingFilter(allOwnedBlocks), 'archived');
  // A filter with zero matches is not an empty account.
  assert.equal(allOwnedBlocks.filter(b => b.status === 'archived').length, 0);
  assert.equal(allOwnedBlocks.length, 2);
});
test('start indicators handle future/tomorrow/today/past/unknown and include other years', () => {
  const today = '2026-11-20';
  assert.equal(trainingStartLabel('2026-11-23', today), 'Training starts in 3 days · November 23');
  assert.equal(trainingStartLabel('2026-11-21', today), 'Training starts tomorrow · November 21');
  assert.equal(trainingStartLabel(today, today), 'Training starts today · November 20');
  assert.equal(trainingStartLabel('2026-11-19', today), 'Scheduled start was 1 day ago · November 19');
  assert.equal(trainingStartLabel('2026-11-18', today), 'Scheduled start was 2 days ago · November 18');
  for (const unknown of [null, '', '2026-02-30']) assert.equal(trainingStartLabel(unknown, today), 'Start date not scheduled');
  assert.equal(trainingStartLabel('2027-01-01', '2026-12-31'), 'Training starts tomorrow · January 1, 2027');
  assert.equal(trainingStartLabel('2026-12-31', '2027-01-01'), 'Scheduled start was 1 day ago · December 31, 2026');
});
test('countdowns use calendar days across DST, not browser-local elapsed hours', () => {
  assert.match(trainingStartLabel('2026-03-09', '2026-03-08'), /^Training starts tomorrow/);
  assert.match(trainingStartLabel('2026-11-02', '2026-11-01'), /^Training starts tomorrow/);
});
test('dismissal keys isolate accounts, contain no owner identifier, and sign-out clears only guidance', async () => {
  const a = await guidanceSessionKey('synthetic-owner-a'), b = await guidanceSessionKey('synthetic-owner-b');
  assert.notEqual(a, b);
  assert.equal(a, await guidanceSessionKey('synthetic-owner-a'));
  assert.ok(a.startsWith(GUIDANCE_PREFIX));
  assert.ok(!a.includes('synthetic-owner-a'));
  const data = new Map([[a, 'dismissed'], [b, 'dismissed'], ['unrelated', 'keep']]);
  const storage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, removeItem: key => data.delete(key) };
  clearGuidanceSession(storage);
  assert.deepEqual([...data], [['unrelated', 'keep']]);
});

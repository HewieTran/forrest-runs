import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBlockDeletion } from '../lib/blocks.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

test('permanent deletion needs an exact-name confirmation, version and snapshot digest', () => {
  const input = { version: 3, confirmation: 'Example block', revision: 'a'.repeat(64) };
  assert.deepEqual(validateBlockDeletion({ ...input, ownerId: 'ignored' }), input);
  for (const invalid of [null, {}, { ...input, version: '3' }, { ...input, version: 0 }, { ...input, confirmation: '' }, { ...input, revision: '' }, { ...input, revision: 'not-a-digest' }]) assert.throws(() => validateBlockDeletion(invalid));
});
test('an account with all blocks deleted can export an empty v5 backup', () => {
  const backup = { schemaVersion: 5, exportedAt: '2026-10-24T00:00:00.000Z', blocks: [], workouts: [], restDays: [] };
  assert.deepEqual(normalizeTrainingBackup(backup), { ...backup, schemaVersion: 6 });
});

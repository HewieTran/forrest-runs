import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeBlockStatus, validateNewBlock, validateBlockStatus } from '../lib/blocks.ts';

test('block lifecycle only permits explicit supported transitions', () => {
  assert.equal(canChangeBlockStatus('draft', 'completed'), false);
  assert.equal(canChangeBlockStatus('archived', 'active'), false);
  assert.equal(canChangeBlockStatus('active', 'completed'), true);
  assert.equal(canChangeBlockStatus('completed', 'active'), false);
  assert.equal(canChangeBlockStatus('archived', 'draft'), true);
});
test('manual drafts validate their basic inputs and ignore supplied ownership or status', () => {
  assert.deepEqual(validateNewBlock({ raceName: '  Spring 10K  ', raceDate: '2027-03-01', status: 'active', ownerId: 'foreign' }), { raceName: 'Spring 10K', raceDate: '2027-03-01' });
  for (const value of [null, {}, { raceName: '', raceDate: '2027-03-01' }, { raceName: 'Goal', raceDate: '2027-02-30' }]) assert.throws(() => validateNewBlock(value));
  for (const value of [{ status: 'deleted', version: 1 }, { status: 'active', version: 0 }, { status: 'active', version: 1.5 }]) assert.throws(() => validateBlockStatus(value));
});

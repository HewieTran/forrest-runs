import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { EMPTY_WORKOUT_MEASUREMENTS } from '../lib/workout-targets.ts';

const date = '2026-10-23T12:00:00.000Z';
const plan = { id: 'old-plan', raceName: 'Original race', raceDate: '2026-12-11', paceGuide: [], sourceName: 'source.xlsx', version: 4, createdAt: date, updatedAt: date };
const workout = { id: 'old-workout', planId: plan.id, date: '2026-10-23', phase: 'Peak', type: 'Easy Run', plannedWorkout: ' Original prescription ', targetPace: 'Easy', done: true, actualDistance: null, actualPace: '', effort: null, pain: '', notes: 'Original notes\nSecond line', sourceRow: 2, originalSource: { distance: null, note: 'original' }, version: 7, updatedAt: date };
const legacy = { schemaVersion: 1, exportedAt: date, plan, workouts: [workout] };

test('legacy backup gains active status without rewriting historical values', () => {
  const normalized = normalizeTrainingBackup(legacy);
  assert.deepEqual(normalized.blocks, [{ ...plan, status: 'active' }]);
  assert.deepEqual(normalized.workouts, [{ ...EMPTY_WORKOUT_MEASUREMENTS, ...workout }]);
  assert.deepEqual(normalized.restDays, []);
  assert.equal(normalized.exportedAt, date);
  assert.equal(normalized.schemaVersion, 4);
  assert.equal('status' in legacy.plan, false);
});

test('all-block backup preserves statuses, IDs, null/zero distances, source data, and versions', () => {
  const backup = { schemaVersion: 2, exportedAt: date,
    blocks: ['active', 'draft', 'completed', 'archived'].map((status) => ({ ...plan, id: status, status })),
    workouts: [null, 0, 5].map((actualDistance, index) => ({ ...workout, id: `workout-${index}`, planId: 'completed', actualDistance })),
  };
  assert.deepEqual(normalizeTrainingBackup(backup), { ...backup, schemaVersion: 4, restDays: [], workouts: backup.workouts.map(row => ({ ...EMPTY_WORKOUT_MEASUREMENTS, ...row })) });
  const withOwner = structuredClone(backup);
  withOwner.blocks[0].ownerId = 'untrusted-owner';
  assert.equal('ownerId' in normalizeTrainingBackup(withOwner).blocks[0], false);
});

test('invalid or ambiguous backups fail closed', () => {
  const valid = normalizeTrainingBackup(legacy);
  const invalid = [
    { ...legacy, schemaVersion: 5 },
    { ...valid, blocks: [valid.blocks[0], valid.blocks[0]] },
    { ...valid, blocks: [valid.blocks[0], { ...valid.blocks[0], id: 'another-active' }] },
    { ...valid, blocks: [{ ...valid.blocks[0], status: 'invalid' }] },
    { ...valid, blocks: [{ ...valid.blocks[0], status: undefined }] },
    { ...valid, workouts: [workout, workout] },
    { ...valid, workouts: [{ ...workout, planId: 'missing' }] },
    { ...valid, workouts: [{ ...workout, version: 0 }] },
    { ...valid, workouts: [{ ...workout, actualDistance: -1 }] },
    { ...valid, workouts: [{ ...workout, sourceRow: -1 }] },
    { ...valid, workouts: [{ ...workout, originalSource: [] }] },
    { ...valid, exportedAt: 'invalid' },
  ];
  for (const backup of invalid) assert.throws(() => normalizeTrainingBackup(backup));
});

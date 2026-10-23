import { BLOCK_STATUSES, validDate, validateWorkout, type Plan, type Workout } from './domain.ts';

export type TrainingBackupV2 = {
  schemaVersion: 2;
  exportedAt: string;
  blocks: Plan[];
  workouts: Workout[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a backup record.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected backup text.');
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 200 || result.trim() !== result || /[\u0000-\u001f\u007f]/.test(result))
    throw new Error('Invalid backup ID.');
  return result;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error('Invalid backup timestamp.');
  return result;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('Invalid record version.');
  return value as number;
}

// Validate and normalize offline only. This does not grant ownership or write to storage.
// IDs, source data, null distances, and optimistic-lock versions survive unchanged.
export function normalizeTrainingBackup(value: unknown): TrainingBackupV2 {
  const input = record(value);
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2)
    throw new Error('Unsupported backup version.');
  const sourceBlocks = input.schemaVersion === 1 ? [input.plan] : input.blocks;
  if (!Array.isArray(sourceBlocks) || !sourceBlocks.length || !Array.isArray(input.workouts))
    throw new Error('The backup must contain blocks and workouts.');
  const blockIds = new Set<string>();
  let activeCount = 0;
  const blocks: Plan[] = sourceBlocks.map((value) => {
    const block = record(value);
    const blockId = id(block.id);
    if (blockIds.has(blockId)) throw new Error('Duplicate block ID.');
    blockIds.add(blockId);
    const status = block.status ?? (input.schemaVersion === 1 ? 'active' : undefined);
    if (!BLOCK_STATUSES.includes(status as Plan['status'])) throw new Error('Invalid block status.');
    if (status === 'active' && ++activeCount > 1) throw new Error('Only one block may be active.');
    if (!validDate(block.raceDate) || !text(block.raceName).trim() || !Array.isArray(block.paceGuide))
      throw new Error('Invalid block settings.');
    return {
      id: blockId, status: status as Plan['status'], raceName: text(block.raceName), raceDate: block.raceDate,
      paceGuide: block.paceGuide.map((value) => {
        const guide = record(value);
        return { type: text(guide.type), target: text(guide.target), rule: text(guide.rule) };
      }),
      sourceName: block.sourceName === null ? null : text(block.sourceName),
      version: version(block.version), createdAt: timestamp(block.createdAt), updatedAt: timestamp(block.updatedAt),
    };
  });
  const workoutIds = new Set<string>();
  const workouts: Workout[] = input.workouts.map((value) => {
    const workout = record(value);
    const workoutId = id(workout.id), planId = id(workout.planId);
    if (workoutIds.has(workoutId)) throw new Error('Duplicate workout ID.');
    workoutIds.add(workoutId);
    if (!blockIds.has(planId)) throw new Error('A workout references an unavailable block.');
    if (workout.sourceRow !== null && (!Number.isSafeInteger(workout.sourceRow) || Number(workout.sourceRow) < 1))
      throw new Error('Invalid source row.');
    const values = validateWorkout(workout);
    return {
      ...values, plannedWorkout: text(workout.plannedWorkout), id: workoutId, planId,
      version: version(workout.version), updatedAt: timestamp(workout.updatedAt),
      sourceRow: workout.sourceRow as number | null,
      originalSource: workout.originalSource === null ? null : record(workout.originalSource),
    };
  });
  return { schemaVersion: 2, exportedAt: timestamp(input.exportedAt), blocks, workouts };
}

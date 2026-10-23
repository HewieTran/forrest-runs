import { BLOCK_STATUSES, validDate, type BlockStatus, type Plan } from './domain.ts';

export type NewBlockInput = Pick<Plan, 'raceName' | 'raceDate'>;
export type BlockStatusInput = Pick<Plan, 'status' | 'version'>;
export type BlockSummary = Plan & {
  workoutCount: number;
  completedCount: number;
  recordedMiles: number;
  firstWorkoutDate: string | null;
  lastWorkoutDate: string | null;
};

export const STATUS_LABELS: Record<BlockStatus, string> = {
  draft: 'Draft', active: 'Active', completed: 'Completed', archived: 'Archived',
};
export const BLOCK_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: ['draft'],
};
export function canChangeBlockStatus(from: BlockStatus, to: BlockStatus) {
  return BLOCK_TRANSITIONS[from].includes(to);
}
export function validateNewBlock(value: unknown): NewBlockInput {
  const input = value as Record<string, unknown> | null;
  if (!input || typeof input.raceName !== 'string' || !input.raceName.trim() || input.raceName.length > 120 || !validDate(input.raceDate))
    throw new Error('Enter a block name and a valid target date.');
  return { raceName: input.raceName.trim(), raceDate: input.raceDate };
}
export function validateBlockStatus(value: unknown): BlockStatusInput {
  const input = value as Record<string, unknown> | null;
  if (!input || !BLOCK_STATUSES.includes(input.status as BlockStatus) || !Number.isSafeInteger(input.version) || Number(input.version) < 1)
    throw new Error('Choose a valid block status and reload the latest version.');
  return { status: input.status as BlockStatus, version: input.version as number };
}

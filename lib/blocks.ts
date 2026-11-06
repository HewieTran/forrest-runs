import { BLOCK_STATUSES, validDate, type BlockStatus, type Plan } from './domain.ts';

export type NewBlockInput = Pick<Plan, 'raceName' | 'raceDate'>;
export type BlockStatusInput = Pick<Plan, 'status' | 'version'>;
export type BlockSummary = Plan & {
  hasSetup?: boolean;
  hasGeneratedPlan?: boolean;
  isSimulation?: boolean;
  workoutCount: number;
  completedCount: number;
  recordedMiles: number;
  firstWorkoutDate: string | null;
  lastWorkoutDate: string | null;
};

export const STATUS_LABELS: Record<BlockStatus, string> = {
  draft: 'Draft', active: 'In progress', completed: 'Completed', archived: 'Archived',
};
export function blockReady(block: Pick<Plan, 'status' | 'setup' | 'generation'> & { hasSetup?: boolean; hasGeneratedPlan?: boolean; workoutCount?: number }) {
  return block.status === 'draft' && (block.generation?.status === 'accepted' || block.hasGeneratedPlan === true || (!block.setup && !block.hasSetup && (block.workoutCount ?? 0) > 0));
}
export function blockStatusLabel(block: Pick<Plan, 'status' | 'setup' | 'generation'> & { hasSetup?: boolean; hasGeneratedPlan?: boolean; workoutCount?: number }) {
  return blockReady(block) ? 'Not started' : STATUS_LABELS[block.status];
}
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

export type BlockDeletionPreview = {
  id: string; name: string; status: BlockStatus; version: number;
  workoutCount: number; restDayCount: number; revision: string;
};
export type DeleteBlockInput = { version: number; confirmation: string; revision: string };
export function validateBlockDeletion(value: unknown): DeleteBlockInput {
  const input = value as Record<string, unknown> | null;
  if (!input || !Number.isSafeInteger(input.version) || Number(input.version) < 1 ||
      typeof input.confirmation !== 'string' || !input.confirmation || input.confirmation.length > 120 ||
      typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision))
    throw new Error('Reload the deletion details and type the exact block name to confirm.');
  return { version: input.version as number, confirmation: input.confirmation, revision: input.revision };
}

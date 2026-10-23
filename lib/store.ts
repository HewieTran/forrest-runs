import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { plans, workouts } from '../db/schema';
import {
  addDays,
  centralToday,
  type AppData,
  type Plan,
  type RaceSettingsInput,
  type WorkoutInput,
} from './domain';
import type { AppUser } from './user';
import { insertInitialTraining, loadOwnerSeed } from '../db/initial-training';
import type { TrainingBackupV2 } from './backups';
import { TrainingRequestError } from './training-errors';
import { canChangeBlockStatus, type NewBlockInput, type BlockStatusInput, type BlockSummary } from './blocks';
import type { BlockSetup } from './setup';

export async function userPlan(user: AppUser, blockId?: string) {
  const database = getDb();
  if (blockId !== undefined) {
    const ownedBlock = await database.select().from(plans)
      .where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId))).get();
    if (!ownedBlock) throw new TrainingRequestError('This training block is unavailable.', 404);
    return ownedBlock;
  }
  let plan = await database
    .select()
    .from(plans)
    .where(and(eq(plans.ownerId, user.userId), eq(plans.status, 'active')))
    .get();
  if (!plan) {
    // A stable fallback supports accounts with drafts/history but no active block.
    plan = await database.select().from(plans)
      .where(eq(plans.ownerId, user.userId))
      .orderBy(asc(plans.createdAt), asc(plans.id)).limit(1).get();
  }
  // Existing plans are authoritative; the spreadsheet seed is only used once.
  if (plan) return plan;
  const seed = await loadOwnerSeed(user.email);
  const timestamp = new Date().toISOString();
  const planId = `plan:${user.userId}`;
  const initialPlan = {
    id: planId,
    ownerId: user.userId,
    raceName: seed?.raceName ?? 'My marathon',
    raceDate: seed?.raceDate ?? addDays(centralToday(), 180),
    paceGuide: seed?.paceGuide ?? [],
    sourceName: seed?.sourceName ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    // Create the plan and its workouts atomically, without partial imports.
    await insertInitialTraining(initialPlan, seed?.workouts ?? []);
  } catch (error) {
    // Another first-load request may have atomically created the same plan.
    plan = await database
      .select()
      .from(plans)
      .where(eq(plans.ownerId, user.userId))
      .orderBy(asc(plans.createdAt), asc(plans.id)).limit(1)
      .get();
    if (!plan) throw error;
  }
  return (await database
    .select()
    .from(plans)
    .where(eq(plans.ownerId, user.userId))
    .orderBy(asc(plans.createdAt), asc(plans.id)).limit(1)
    .get())!;
}
export async function loadTraining(user: AppUser, blockId?: string): Promise<AppData> {
  const ownedPlan = await userPlan(user, blockId);
  const { ownerId: _ownerId, ...plan } = ownedPlan;
  const savedWorkouts = await getDb()
    .select()
    .from(workouts)
    .where(eq(workouts.planId, plan.id))
    .orderBy(asc(workouts.date), asc(workouts.sourceRow));
  return {
    plan,
    workouts: savedWorkouts,
    displayName: user.fullName?.split(' ')[0] ?? 'Runner',
    today: centralToday(),
  };
}

export async function writablePlan(user: AppUser, blockId?: string) {
  const selectedPlan = await userPlan(user, blockId);
  if (selectedPlan.setup) throw new TrainingRequestError('Continue the guided setup. A reviewed schedule is required before editing workouts or activating this block.', 409);
  if (blockId === undefined) {
    const anotherBlock = await getDb().select({ id: plans.id }).from(plans)
      .where(and(eq(plans.ownerId, user.userId), ne(plans.id, selectedPlan.id)))
      .limit(1).get();
    // Old tabs must reload rather than silently save into a different active block.
    if (anotherBlock) throw new TrainingRequestError('Select a training block before saving. Reload to continue.', 409);
  }
  return selectedPlan;
}

export async function saveRaceSettings(
  user: AppUser,
  input: RaceSettingsInput,
  blockId?: string,
): Promise<AppData> {
  const plan = await writablePlan(user, blockId);
  const saved = await getDb()
    .update(plans)
    .set({
      raceName: input.raceName.trim(),
      raceDate: input.raceDate,
      version: input.version + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(plans.id, plan.id),
      eq(plans.ownerId, user.userId),
      eq(plans.version, input.version),
    ))
    .returning()
    .get();
  if (!saved) {
    throw new TrainingRequestError('Race settings changed in another tab. Reload before saving.', 409);
  }
  return loadTraining(user, plan.id);
}

export async function listBlocks(user: AppUser): Promise<Plan[]> {
  await userPlan(user);
  const ownedBlocks = await getDb().select().from(plans)
    .where(eq(plans.ownerId, user.userId))
    .orderBy(asc(plans.createdAt), asc(plans.id));
  return ownedBlocks.map(({ ownerId: _ownerId, ...block }) => block);
}

export async function loadBlockLibrary(user: AppUser): Promise<BlockSummary[]> {
  await userPlan(user);
  // One grouped read returns card summaries without downloading every workout.
  const rows = await getDb().select({
    block: {
      id: plans.id, status: plans.status, raceName: plans.raceName, raceDate: plans.raceDate,
      paceGuide: plans.paceGuide, sourceName: plans.sourceName, version: plans.version,
      createdAt: plans.createdAt, updatedAt: plans.updatedAt,
    },
    hasSetup: sql<boolean>`${plans.setup} is not null`.mapWith(Boolean),
    workoutCount: sql<number>`count(${workouts.id})`.mapWith(Number),
    completedCount: sql<number>`coalesce(sum(case when ${workouts.done} = 1 then 1 else 0 end), 0)`.mapWith(Number),
    recordedMiles: sql<number>`coalesce(sum(case when ${workouts.done} = 1 and ${workouts.type} not in ('Strength', 'Mobility') then ${workouts.actualDistance} else 0 end), 0)`.mapWith(Number),
    firstWorkoutDate: sql<string | null>`min(${workouts.date})`,
    lastWorkoutDate: sql<string | null>`max(${workouts.date})`,
  }).from(plans).leftJoin(workouts, eq(workouts.planId, plans.id))
    .where(eq(plans.ownerId, user.userId)).groupBy(plans.id)
    .orderBy(desc(plans.createdAt), asc(plans.id));
  return rows.map(({ block, ...summary }) => ({ ...block, ...summary }));
}

export async function createBlock(user: AppUser, input: NewBlockInput, setup?: BlockSetup): Promise<Plan> {
  // Preserve the first-load import even if an account's first request creates a draft.
  await userPlan(user);
  const timestamp = new Date().toISOString();
  const saved = await getDb().insert(plans).values({
    id: crypto.randomUUID(), ownerId: user.userId, status: 'draft',
    raceName: input.raceName, raceDate: input.raceDate, paceGuide: [],
    sourceName: null, version: 1, createdAt: timestamp, updatedAt: timestamp,
    setup: setup ?? null,
  }).returning().get();
  const { ownerId: _ownerId, ...block } = saved!;
  return block;
}

export async function changeBlockStatus(user: AppUser, blockId: string, input: BlockStatusInput): Promise<Plan> {
  const block = await userPlan(user, blockId);
  if (input.status === 'active' && block.setup) throw new TrainingRequestError('A guided draft needs a generated and reviewed schedule before activation. Your setup remains saved.', 409);
  if (!canChangeBlockStatus(block.status, input.status))
    throw new TrainingRequestError('This status change is unavailable. Reload the block to see its current status.', 409);
  // A single conditional update is atomic. Two racing activations cannot both win;
  // the partial unique index is an additional database-level guarantee.
  const saved = await getDb().update(plans).set({
    status: input.status, version: input.version + 1, updatedAt: new Date().toISOString(),
  }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId),
    eq(plans.version, input.version), eq(plans.status, block.status),
    input.status === 'active'
      ? sql`not exists (select 1 from training_plans active_block where active_block.owner_id = ${user.userId} and active_block.status = 'active')`
      : undefined,
    input.status === 'active' ? isNull(plans.setup) : undefined,
  )).returning().get();
  if (!saved) throw new TrainingRequestError(
    input.status === 'active'
      ? 'The block changed or another block is active. Complete or archive the active block, then reload before activating.'
      : 'This block changed in another tab. Reload before changing its status.', 409,
  );
  const { ownerId: _ownerId, ...result } = saved;
  return result;
}

export async function saveBlockSetup(user: AppUser, blockId: string, setup: BlockSetup, version: number): Promise<Plan> {
  const block = await userPlan(user, blockId);
  if (block.status !== 'draft') throw new TrainingRequestError('Only drafts can change their setup. Your existing block and results have been preserved.', 409);
  const saved = await getDb().update(plans).set({
    setup, raceName: setup.goal.name, raceDate: setup.goal.targetDate,
    version: version + 1, updatedAt: new Date().toISOString(),
  }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, version), eq(plans.status, 'draft'),
    sql`not exists (select 1 from workouts existing_workout where existing_workout.plan_id = ${blockId})`,
  )).returning().get();
  if (!saved) throw new TrainingRequestError('This draft changed or already contains workouts. Reload it; use a new empty draft for guided setup.', 409);
  const { ownerId: _ownerId, ...plan } = saved;
  return plan;
}

export async function loadSetupPage(user: AppUser, blockId: string) {
  const { ownerId: _ownerId, ...block } = await userPlan(user, blockId);
  const row = await getDb().select({ id: workouts.id }).from(workouts).where(eq(workouts.planId, blockId)).limit(1).get();
  return { block, hasWorkouts: !!row };
}

export async function activeBlock(user: AppUser): Promise<Pick<Plan, 'id' | 'raceName'> | null> {
  return await getDb().select({ id: plans.id, raceName: plans.raceName }).from(plans)
    .where(and(eq(plans.ownerId, user.userId), eq(plans.status, 'active'))).get() ?? null;
}

export async function exportTraining(user: AppUser): Promise<TrainingBackupV2> {
  await userPlan(user);
  const database = getDb();
  // One atomic batch gives both queries the same account snapshot. No per-block queries.
  const [ownedBlocks, ownedWorkouts] = await database.batch([
    database.select().from(plans).where(eq(plans.ownerId, user.userId))
      .orderBy(asc(plans.createdAt), asc(plans.id)),
    database.select({ workout: workouts }).from(workouts)
      .innerJoin(plans, eq(workouts.planId, plans.id))
      .where(eq(plans.ownerId, user.userId))
      .orderBy(asc(workouts.planId), asc(workouts.date), asc(workouts.id)),
  ]);
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    blocks: ownedBlocks.map(({ ownerId: _ownerId, ...block }) => block),
    workouts: ownedWorkouts.map(({ workout }) => workout),
  };
}
export async function saveWorkout(
  user: AppUser,
  workoutId: string,
  input: WorkoutInput,
  blockId?: string,
) {
  const plan = await writablePlan(user, blockId);
  const { version, ...workoutValues } = input;
  // Ownership prevents cross-account edits. Version matching rejects stale tabs.
  return getDb()
    .update(workouts)
    .set({
      ...workoutValues,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(workouts.id, workoutId),
        eq(workouts.planId, plan.id),
        eq(workouts.version, version),
      ),
    )
    .returning()
    .get();
}
export async function addWorkout(user: AppUser, input: WorkoutInput, blockId?: string) {
  const plan = await writablePlan(user, blockId);
  const database = getDb();
  // The condition stays in the insert, closing a race with attaching guided setup.
  const saved = await database.insert(workouts).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), planId: plans.id,
    date: sql<string>`${input.date}`.as('date'), phase: sql<string>`${input.phase}`.as('phase'), type: sql<string>`${input.type}`.as('type'),
    plannedWorkout: sql<string>`${input.plannedWorkout}`.as('plannedWorkout'), targetPace: sql<string>`${input.targetPace}`.as('targetPace'),
    done: sql<boolean>`${input.done ? 1 : 0}`.as('done'), actualDistance: sql<number | null>`${input.actualDistance}`.as('actualDistance'),
    actualPace: sql<string>`${input.actualPace}`.as('actualPace'), effort: sql<number | null>`${input.effort}`.as('effort'),
    pain: sql<string>`${input.pain}`.as('pain'), notes: sql<string>`${input.notes}`.as('notes'),
    sourceRow: sql<number | null>`null`.as('sourceRow'), originalSource: sql<Record<string, unknown> | null>`null`.as('originalSource'),
    version: sql<number>`1`.as('version'), updatedAt: sql<string>`${new Date().toISOString()}`.as('updatedAt'),
  }).from(plans).where(and(eq(plans.id, plan.id), eq(plans.ownerId, user.userId), isNull(plans.setup))))
    .returning().get();
  if (!saved) throw new TrainingRequestError('This block changed to guided setup. Reload before adding workouts.', 409);
  return saved;
}

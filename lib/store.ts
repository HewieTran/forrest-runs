import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { plans, workouts, restDays } from '../db/schema';
import {
  addDays,
  centralToday,
  type AppData,
  type Plan,
  type RaceSettingsInput,
  type WorkoutInput,
  type RestDay,
} from './domain';
import type { AppUser } from './user';
import { insertInitialTraining, loadOwnerSeed } from '../db/initial-training';
import type { TrainingBackupV4 } from './backups';
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
  const database = getDb();
  const [savedWorkouts, savedRestDays] = await database.batch([
    database.select().from(workouts).where(eq(workouts.planId, plan.id))
      .orderBy(asc(workouts.date), asc(workouts.sourceRow)),
    database.select().from(restDays).where(eq(restDays.planId, plan.id))
      .orderBy(asc(restDays.date)),
  ]);
  return {
    plan,
    workouts: savedWorkouts,
    restDays: savedRestDays,
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
    sql`not exists (select 1 from training_rest_days existing_rest where existing_rest.plan_id = ${blockId})`,
  )).returning().get();
  if (!saved) throw new TrainingRequestError('This draft changed or already contains scheduled days. Reload it; use a new empty draft for guided setup.', 409);
  const { ownerId: _ownerId, ...plan } = saved;
  return plan;
}

export async function loadSetupPage(user: AppUser, blockId: string) {
  const { ownerId: _ownerId, ...block } = await userPlan(user, blockId);
  const [workoutRows, restRows] = await getDb().batch([
    getDb().select({ id: workouts.id }).from(workouts).where(eq(workouts.planId, blockId)).limit(1),
    getDb().select({ id: restDays.id }).from(restDays).where(eq(restDays.planId, blockId)).limit(1),
  ]);
  // The existing setup UI must treat any explicit schedule as non-empty.
  return { block, hasWorkouts: workoutRows.length > 0 || restRows.length > 0 };
}

export async function activeBlock(user: AppUser): Promise<Pick<Plan, 'id' | 'raceName'> | null> {
  return await getDb().select({ id: plans.id, raceName: plans.raceName }).from(plans)
    .where(and(eq(plans.ownerId, user.userId), eq(plans.status, 'active'))).get() ?? null;
}

export async function exportTraining(user: AppUser, blockId?: string): Promise<TrainingBackupV4> {
  await userPlan(user, blockId);
  const database = getDb();
  const scope = and(eq(plans.ownerId, user.userId), blockId === undefined ? undefined : eq(plans.id, blockId));
  // One atomic batch captures measurements and rest designations together.
  const [ownedBlocks, ownedWorkouts, ownedRestDays] = await database.batch([
    database.select().from(plans).where(scope)
      .orderBy(asc(plans.createdAt), asc(plans.id)),
    database.select({ workout: workouts }).from(workouts)
      .innerJoin(plans, eq(workouts.planId, plans.id))
      .where(scope)
      .orderBy(asc(workouts.planId), asc(workouts.date), asc(workouts.id)),
    database.select({ restDay: restDays }).from(restDays)
      .innerJoin(plans, eq(restDays.planId, plans.id)).where(scope)
      .orderBy(asc(restDays.planId), asc(restDays.date), asc(restDays.id)),
  ]);
  return {
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    blocks: ownedBlocks.map(({ ownerId: _ownerId, ...block }) => block),
    workouts: ownedWorkouts.map(({ workout }) => workout),
    restDays: ownedRestDays.map(({ restDay }) => restDay),
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
        sql`not exists (select 1 from training_rest_days rest where rest.plan_id = ${plan.id} and rest.date = ${input.date})`,
      ),
    )
    .returning()
    .get();
}
export async function addWorkout(user: AppUser, input: WorkoutInput, blockId?: string) {
  const plan = await writablePlan(user, blockId);
  const database = getDb();
  const plannedDistance = input.plannedDistance ?? null;
  const plannedDurationSeconds = input.plannedDurationSeconds ?? null;
  const actualDurationSeconds = input.actualDurationSeconds ?? null;
  const targetMetric = input.targetMetric ?? null;
  // The condition stays in the insert, closing a race with attaching guided setup.
  const saved = await database.insert(workouts).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), planId: plans.id,
    date: sql<string>`${input.date}`.as('date'), phase: sql<string>`${input.phase}`.as('phase'), type: sql<string>`${input.type}`.as('type'),
    plannedWorkout: sql<string>`${input.plannedWorkout}`.as('plannedWorkout'), targetPace: sql<string>`${input.targetPace}`.as('targetPace'),
    done: sql<boolean>`${input.done ? 1 : 0}`.as('done'), actualDistance: sql<number | null>`${input.actualDistance}`.as('actualDistance'),
    plannedDistance: sql<number | null>`${plannedDistance}`.as('plannedDistance'),
    plannedDurationSeconds: sql<number | null>`${plannedDurationSeconds}`.as('plannedDurationSeconds'),
    actualDurationSeconds: sql<number | null>`${actualDurationSeconds}`.as('actualDurationSeconds'),
    targetMetric: sql<'distance' | 'duration' | null>`${targetMetric}`.as('targetMetric'),
    plannedPaceSecondsPerMile: sql<number | null>`${input.plannedPaceSecondsPerMile ?? null}`.as('plannedPaceSecondsPerMile'),
    actualPaceSecondsPerMile: sql<number | null>`${input.actualPaceSecondsPerMile ?? null}`.as('actualPaceSecondsPerMile'),
    actualPace: sql<string>`${input.actualPace}`.as('actualPace'), effort: sql<number | null>`${input.effort}`.as('effort'),
    pain: sql<string>`${input.pain}`.as('pain'), notes: sql<string>`${input.notes}`.as('notes'),
    sourceRow: sql<number | null>`null`.as('sourceRow'), originalSource: sql<Record<string, unknown> | null>`null`.as('originalSource'),
    version: sql<number>`1`.as('version'), updatedAt: sql<string>`${new Date().toISOString()}`.as('updatedAt'),
  }).from(plans).where(and(eq(plans.id, plan.id), eq(plans.ownerId, user.userId), isNull(plans.setup),
    sql`not exists (select 1 from training_rest_days rest where rest.plan_id = ${plan.id} and rest.date = ${input.date})`)))
    .returning().get();
  if (!saved) throw new TrainingRequestError('The schedule changed or this date is a planned rest day. Reload before adding workouts.', 409);
  return saved;
}

export async function addRestDay(user: AppUser, blockId: string, date: string): Promise<RestDay> {
  const plan = await writablePlan(user, blockId);
  const database = getDb();
  // The condition and insert execute as one statement, including competing
  // workout inserts and attaching guided setup to an otherwise empty draft.
  const saved = await database.insert(restDays).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'),
    planId: plans.id,
    date: sql<string>`${date}`.as('date'),
    version: sql<number>`1`.as('version'),
    updatedAt: sql<string>`${new Date().toISOString()}`.as('updatedAt'),
  }).from(plans).where(and(eq(plans.id, plan.id), eq(plans.ownerId, user.userId), isNull(plans.setup),
    sql`not exists (select 1 from workouts scheduled where scheduled.plan_id = ${plan.id} and scheduled.date = ${date})`,
    sql`not exists (select 1 from training_rest_days rest where rest.plan_id = ${plan.id} and rest.date = ${date})`,
  ))).returning().get();
  if (!saved) throw new TrainingRequestError('This date already has a workout or rest day, or the block changed. Reload the schedule.', 409);
  return saved;
}

export async function removeRestDay(user: AppUser, blockId: string, restDayId: string, version: number) {
  const plan = await writablePlan(user, blockId);
  // Rest records are immutable. Removing/recreating a date gets a new ID, so a
  // stale deletion cannot remove a subsequently created rest designation.
  return getDb().delete(restDays).where(and(eq(restDays.id, restDayId),
    eq(restDays.planId, plan.id), eq(restDays.version, version))).returning().get();
}

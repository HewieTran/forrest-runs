import { raceDistanceLabel } from './race-distance';
import { verifyCalculatedMeasurements } from './planner-math';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { plans, workouts, restDays, accountState, aiUsage } from '../db/schema';
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
import type { TrainingBackupV6 } from './backups';
import { TrainingRequestError } from './training-errors';
import { canChangeBlockStatus, type NewBlockInput, type BlockStatusInput, type BlockSummary, type BlockDeletionPreview, type DeleteBlockInput } from './blocks';
import type { BlockSetup } from './setup';
import { acceptedPlan, simulatedBlock, requiresAssessment, changesPrescription, preparePlanner, scheduleDays, validatePlanOutput, workoutForSession, PROMPT_VERSION, PLANNER_VERSION, type Generation } from './planner';
import { PlanProviderError, type requestOpenAIPlan } from './openai-plan';
import { summarizeRecentBaseline } from './recent-baseline';
import { applyCompletion } from './workout-completion';
import { APPROVED_PLAN_MODEL, PRICING_VERSION, MONTHLY_BUDGET_MICRODOLLARS, REQUEST_RESERVE_MICRODOLLARS, DAILY_ATTEMPT_LIMIT, estimatedCost, usageWithinReservation } from './planner-policy';

async function ensureUserInitialized(user: AppUser) {
  const database = getDb();
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
  if (await database.select().from(accountState).where(eq(accountState.ownerId, user.userId)).get()) return null;
  const seed = await loadOwnerSeed(user.email);
  if (!seed) return null;
  const timestamp = new Date().toISOString();
  const planId = `plan:${user.userId}`;
  const initialPlan = {
    id: planId,
    ownerId: user.userId,
    raceName: seed.raceName,
    raceDate: seed.raceDate,
    paceGuide: seed.paceGuide,
    sourceName: seed.sourceName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    // Create the plan and its workouts atomically, without partial imports.
    await insertInitialTraining(initialPlan, seed.workouts);
  } catch (error) {
    // Another first-load request may have atomically created the same plan.
    plan = await database
      .select()
      .from(plans)
      .where(eq(plans.ownerId, user.userId))
      .orderBy(asc(plans.createdAt), asc(plans.id)).limit(1)
      .get();
    if (!plan && !(await database.select().from(accountState).where(eq(accountState.ownerId, user.userId)).get())) throw error;
  }
  return (await database
    .select()
    .from(plans)
    .where(eq(plans.ownerId, user.userId))
    .orderBy(asc(plans.createdAt), asc(plans.id)).limit(1)
    .get()) ?? null;
}

export async function userPlan(user: AppUser, blockId?: string) {
  const plan = blockId === undefined ? await ensureUserInitialized(user) : await getDb().select().from(plans)
    .where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId))).get();
  if (!plan) throw new TrainingRequestError('This training block is unavailable.', 404);
  return plan;
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
  if (selectedPlan.setup && !acceptedPlan(selectedPlan)) throw new TrainingRequestError('Continue the guided setup. A reviewed schedule is required before editing workouts or activating this block.', 409);
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
  confirmPlanChange = false,
): Promise<AppData> {
  const plan = await writablePlan(user, blockId);
  const changed = input.raceDate !== plan.raceDate || input.raceName.trim() !== plan.raceName;
  if (acceptedPlan(plan) && changed && !confirmPlanChange) throw new TrainingRequestError('Confirm changes to this generated plan before saving.', 409);
  const saved = await getDb()
    .update(plans)
    .set({
      ...(acceptedPlan(plan) && changed ? { generation: { ...plan.generation!, alteredAt: new Date().toISOString() } } : {}),
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
  await ensureUserInitialized(user);
  const ownedBlocks = await getDb().select().from(plans)
    .where(eq(plans.ownerId, user.userId))
    .orderBy(asc(plans.createdAt), asc(plans.id));
  return ownedBlocks.map(({ ownerId: _ownerId, ...block }) => block);
}

export async function loadBlockLibrary(user: AppUser): Promise<BlockSummary[]> {
  await ensureUserInitialized(user);
  // One grouped read returns card summaries without downloading every workout.
  const rows = await getDb().select({
    block: {
      id: plans.id, status: plans.status, raceName: plans.raceName, raceDate: plans.raceDate,
      paceGuide: plans.paceGuide, sourceName: plans.sourceName, version: plans.version,
      createdAt: plans.createdAt, updatedAt: plans.updatedAt,
    },
    isSimulation: sql<boolean>`json_extract(${plans.generation}, '$.provider') = 'simulation'`.mapWith(Boolean),
    hasGeneratedPlan: sql<boolean>`json_extract(${plans.generation}, '$.status') = 'accepted'`.mapWith(Boolean),
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
  await ensureUserInitialized(user);
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
  if (input.status === 'active' && simulatedBlock(block)) throw new TrainingRequestError('Simulated schedules are demonstration drafts and cannot be activated.', 409);
  if (input.status === 'active' && block.setup && !acceptedPlan(block)) throw new TrainingRequestError('A guided draft needs a generated and reviewed schedule before activation. Your setup remains saved.', 409);
  if (!canChangeBlockStatus(block.status, input.status))
    throw new TrainingRequestError('This status change is unavailable. Reload the block to see its current status.', 409);
  // A single conditional update is atomic. Two racing activations cannot both win;
  // the partial unique index is an additional database-level guarantee.
  const saved = await getDb().update(plans).set({
    status: input.status, version: input.version + 1, updatedAt: new Date().toISOString(),
  }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId),
    eq(plans.version, input.version), eq(plans.status, block.status),
    input.status === 'active' ? sql`coalesce(json_extract(${plans.generation}, '$.provider'), '') != 'simulation'` : undefined,
    input.status === 'active'
      ? sql`not exists (select 1 from training_plans active_block where active_block.owner_id = ${user.userId} and active_block.status = 'active')`
      : undefined,
    input.status === 'active' ? sql`(${plans.setup} is null or json_extract(${plans.generation}, '$.status') = 'accepted')` : undefined,
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
  if (block.setup && block.setup.schemaVersion > setup.schemaVersion) throw new TrainingRequestError('This setup uses newer fields. Reload before editing so your saved answers are preserved.', 409);
  if (block.status !== 'draft') throw new TrainingRequestError('Only drafts can change their setup. Your existing block and results have been preserved.', 409);
  const saved = await getDb().update(plans).set({
    setup, generation: null, raceName: setup.goal.name, raceDate: setup.goal.targetDate,
    version: version + 1, updatedAt: new Date().toISOString(),
  }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, version), eq(plans.status, 'draft'),
    sql`coalesce(json_extract(${plans.generation}, '$.status'), '') != 'accepted'`,
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

export async function exportTraining(user: AppUser, blockId?: string): Promise<TrainingBackupV6> {
  if (blockId === undefined) await ensureUserInitialized(user);
  else await userPlan(user, blockId);
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
    schemaVersion: 6,
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
  confirmPlanChange = false,
) {
  const plan = await writablePlan(user, blockId);
  const before = await getDb().select().from(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.planId, plan.id))).get();
  if (!before || before.version !== input.version) return undefined;
  if (before.planStructure && input.planStructure === undefined && ['plannedDistance', 'plannedDurationSeconds', 'plannedPaceSecondsPerMile', 'targetMetric', 'type'].some(key => input[key as keyof WorkoutInput] !== undefined && input[key as keyof WorkoutInput] !== before[key as keyof typeof before]))
    throw new TrainingRequestError('Edit the workout steps to update the calculated plan totals.', 400);
  if (acceptedPlan(plan)) {
    if (before && changesPrescription(before, input) && !confirmPlanChange) throw new TrainingRequestError('Confirm changes to this generated plan before saving.', 409);
  }
  const { version, manualResultFields, ...workoutValues } = input;
  const completed = applyCompletion(before, workoutValues, manualResultFields);
  // Ownership prevents cross-account edits. Version matching rejects stale tabs.
  return getDb()
    .update(workouts)
    .set({
      ...workoutValues,
      actualDistance: completed.actualDistance,
      actualDurationSeconds: completed.actualDurationSeconds,
      actualPaceSecondsPerMile: completed.actualPaceSecondsPerMile,
      resultOrigins: completed.resultOrigins,
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
export async function addWorkout(user: AppUser, input: WorkoutInput, blockId?: string, confirmPlanChange = false) {
  const plan = await writablePlan(user, blockId);
  if (acceptedPlan(plan) && !confirmPlanChange) throw new TrainingRequestError('Confirm additions to this generated plan before saving.', 409);
  const database = getDb();
  const copied = applyCompletion({ ...input, done: false as boolean, resultOrigins: null as import('./workout-completion').ResultOrigins | null }, { done: input.done }, input.manualResultFields);
  const plannedDistance = input.plannedDistance ?? null;
  const plannedDurationSeconds = input.plannedDurationSeconds ?? null;
  const actualDurationSeconds = copied.actualDurationSeconds ?? null;
  const targetMetric = input.targetMetric ?? null;
  // The condition stays in the insert, closing a race with attaching guided setup.
  const saved = await database.insert(workouts).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), planId: plans.id,
    date: sql<string>`${input.date}`.as('date'), phase: sql<string>`${input.phase}`.as('phase'), type: sql<string>`${input.type}`.as('type'),
    plannedWorkout: sql<string>`${input.plannedWorkout}`.as('plannedWorkout'), targetPace: sql<string>`${input.targetPace}`.as('targetPace'),
    planStructure: sql<import('./workout-structure').WorkoutStructure | null>`${input.planStructure ? JSON.stringify(input.planStructure) : null}`.as('planStructure'),
    done: sql<boolean>`${input.done ? 1 : 0}`.as('done'), actualDistance: sql<number | null>`${copied.actualDistance}`.as('actualDistance'),
    plannedDistance: sql<number | null>`${plannedDistance}`.as('plannedDistance'),
    plannedDurationSeconds: sql<number | null>`${plannedDurationSeconds}`.as('plannedDurationSeconds'),
    actualDurationSeconds: sql<number | null>`${actualDurationSeconds}`.as('actualDurationSeconds'),
    targetMetric: sql<'distance' | 'duration' | null>`${targetMetric}`.as('targetMetric'),
    plannedPaceSecondsPerMile: sql<number | null>`${input.plannedPaceSecondsPerMile ?? null}`.as('plannedPaceSecondsPerMile'),
    actualPaceSecondsPerMile: sql<number | null>`${copied.actualPaceSecondsPerMile ?? null}`.as('actualPaceSecondsPerMile'),
    actualPace: sql<string>`${input.actualPace}`.as('actualPace'),
    resultOrigins: sql<Record<string, number> | null>`${copied.resultOrigins ? JSON.stringify(copied.resultOrigins) : null}`.as('resultOrigins'), effort: sql<number | null>`${input.effort}`.as('effort'),
    pain: sql<string>`${input.pain}`.as('pain'), notes: sql<string>`${input.notes}`.as('notes'),
    sourceRow: sql<number | null>`null`.as('sourceRow'), originalSource: sql<Record<string, unknown> | null>`null`.as('originalSource'),
    version: sql<number>`1`.as('version'), updatedAt: sql<string>`${new Date().toISOString()}`.as('updatedAt'),
  }).from(plans).where(and(eq(plans.id, plan.id), eq(plans.ownerId, user.userId), sql`(${plans.setup} is null or json_extract(${plans.generation}, '$.status') = 'accepted')`,
    sql`not exists (select 1 from training_rest_days rest where rest.plan_id = ${plan.id} and rest.date = ${input.date})`)))
    .returning().get();
  if (!saved) throw new TrainingRequestError('The schedule changed or this date is a planned rest day. Reload before adding workouts.', 409);
  return saved;
}

export async function addRestDay(user: AppUser, blockId: string, date: string, confirmPlanChange = false): Promise<RestDay> {
  const plan = await writablePlan(user, blockId);
  if (acceptedPlan(plan) && !confirmPlanChange) throw new TrainingRequestError('Confirm changes to this generated plan before saving.', 409);
  const database = getDb();
  // The condition and insert execute as one statement, including competing
  // workout inserts and attaching guided setup to an otherwise empty draft.
  const saved = await database.insert(restDays).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'),
    planId: plans.id,
    date: sql<string>`${date}`.as('date'),
    version: sql<number>`1`.as('version'),
    updatedAt: sql<string>`${new Date().toISOString()}`.as('updatedAt'),
  }).from(plans).where(and(eq(plans.id, plan.id), eq(plans.ownerId, user.userId), sql`(${plans.setup} is null or json_extract(${plans.generation}, '$.status') = 'accepted')`,
    sql`not exists (select 1 from workouts scheduled where scheduled.plan_id = ${plan.id} and scheduled.date = ${date})`,
    sql`not exists (select 1 from training_rest_days rest where rest.plan_id = ${plan.id} and rest.date = ${date})`,
  ))).returning().get();
  if (!saved) throw new TrainingRequestError('This date already has a workout or rest day, or the block changed. Reload the schedule.', 409);
  return saved;
}

export async function removeRestDay(user: AppUser, blockId: string, restDayId: string, version: number, confirmPlanChange = false) {
  const plan = await writablePlan(user, blockId);
  if (acceptedPlan(plan) && !confirmPlanChange) throw new TrainingRequestError('Confirm changes to this generated plan before saving.', 409);
  // Rest records are immutable. Removing/recreating a date gets a new ID, so a
  // stale deletion cannot remove a subsequently created rest designation.
  return getDb().delete(restDays).where(and(eq(restDays.id, restDayId),
    eq(restDays.planId, plan.id), eq(restDays.version, version))).returning().get();
}

// Use only this account's completed records. This is read-only and never seeds,
// modifies, or guesses missing historical measurements.
export async function recentSetupBaseline(user: AppUser, today: string) {
  const rows = await getDb().select({ date: workouts.date, type: workouts.type, done: workouts.done, actualDistance: workouts.actualDistance })
    .from(workouts).innerJoin(plans, eq(workouts.planId, plans.id))
    .where(and(eq(plans.ownerId, user.userId), eq(workouts.done, true), sql`${workouts.date} >= ${addDays(today, -28)}`, sql`${workouts.date} < ${today}`));
  return summarizeRecentBaseline(rows, today);
}

// Generation keeps one current draft per block. Acceptance retains the complete
// input/output snapshot; accepted plans can never be silently regenerated.
export async function startPlanGeneration(user: AppUser, blockId: string, version: number, model: string, provider: 'openai' | 'simulation' = 'openai') {
  if (provider === 'openai' && model !== APPROVED_PLAN_MODEL) throw new PlanProviderError('model_restricted');
  const block = await userPlan(user, blockId);
  if (block.status !== 'draft' || !block.setup || acceptedPlan(block)) throw new TrainingRequestError('Generate from an empty guided draft. This block’s existing schedule is preserved.', 409);
  if (block.version !== version) throw new TrainingRequestError('This intake changed. Reload before generating.', 409);
  let input;
  try { input = preparePlanner(block.setup, centralToday()); }
  catch (error) { throw new TrainingRequestError(error instanceof Error ? error.message : 'Review your intake before generating.', 400); }
  const timestamp = new Date().toISOString();
  const generation: Generation = { schemaVersion: 1, provider, id: crypto.randomUUID(), status: 'generating', startedAt: timestamp, finishedAt: null, acceptedAt: null, alteredAt: null,
    model, promptVersion: PROMPT_VERSION, validatorVersion: PLANNER_VERSION, input, setupSnapshot: block.setup, output: null, error: null, responseId: null, usage: null };
  const leaseCutoff = new Date(Date.now() - 180000).toISOString();
  const cooldown = new Date(Date.now() - 60000).toISOString();
  const database = getDb(), period = timestamp.slice(0, 7), dayStart = timestamp.slice(0, 10) + 'T00:00:00.000Z';
  // Pending/uncertain charges count even across month boundaries. A request
  // settling across a boundary counts in both potentially billed periods.
  const countedSpend = sql<number>`(select coalesce(sum(charged_microdollars), 0) from training_ai_usage where period = ${period} or substr(finished_at, 1, 7) = ${period} or status != 'settled')`;
  const todayAttempts = sql<number>`(select count(*) from training_ai_usage where owner_id = ${user.userId} and started_at >= ${dayStart})`;
  const reserve = database.update(plans).set({ generation, version: version + 1, updatedAt: timestamp }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, version), eq(plans.status, 'draft'),
    sql`not exists (select 1 from workouts w where w.plan_id = ${blockId})`,
    sql`not exists (select 1 from training_rest_days r where r.plan_id = ${blockId})`,
    sql`not exists (select 1 from training_plans p where p.owner_id = ${user.userId} and ((json_extract(p.generation, '$.status') = 'generating' and json_extract(p.generation, '$.startedAt') > ${leaseCutoff}) or json_extract(p.generation, '$.startedAt') > ${cooldown}))`,
    provider === 'openai' ? sql`${countedSpend} + ${REQUEST_RESERVE_MICRODOLLARS} <= ${MONTHLY_BUDGET_MICRODOLLARS}` : undefined,
    provider === 'openai' ? sql`${todayAttempts} < ${DAILY_ATTEMPT_LIMIT}` : undefined,
    provider === 'openai' ? sql`not exists (select 1 from training_ai_usage where owner_id = ${user.userId} and (started_at > ${cooldown} or (status = 'reserved' and started_at > ${leaseCutoff})))` : undefined,
  )).returning();
  let saved;
  if (provider === 'simulation') saved = await reserve.get();
  else {
    const record = database.insert(aiUsage).select(database.select({
      id: sql<string>`${generation.id}`.as('id'), ownerId: plans.ownerId, blockId: plans.id,
      period: sql<string>`${period}`.as('period'), startedAt: sql<string>`${timestamp}`.as('startedAt'),
      finishedAt: sql<string | null>`null`.as('finishedAt'), model: sql<string>`${model}`.as('model'),
      pricingVersion: sql<string>`${PRICING_VERSION}`.as('pricingVersion'), status: sql<'reserved'>`'reserved'`.as('status'),
      reservedMicrodollars: sql<number>`${REQUEST_RESERVE_MICRODOLLARS}`.as('reservedMicrodollars'),
      chargedMicrodollars: sql<number>`${REQUEST_RESERVE_MICRODOLLARS}`.as('chargedMicrodollars'),
      inputTokens: sql<number | null>`null`.as('inputTokens'), outputTokens: sql<number | null>`null`.as('outputTokens'), outcome: sql<string | null>`null`.as('outcome'),
    }).from(plans).where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId), sql`json_extract(${plans.generation}, '$.id') = ${generation.id}`)));
    // D1 executes the guard, block reservation and ledger insert in one atomic
    // batch. Competing users cannot both spend the same remaining budget.
    const result = await database.batch([reserve, record]);
    saved = result[0][0];
  }
  if (!saved) {
    if (provider === 'openai') {
      const limits = await database.select({ spend: countedSpend, attempts: todayAttempts }).from(plans).where(eq(plans.id, blockId)).get();
      if (limits && limits.spend + REQUEST_RESERVE_MICRODOLLARS > MONTHLY_BUDGET_MICRODOLLARS) throw new PlanProviderError('budget');
      if (limits && limits.attempts >= DAILY_ATTEMPT_LIMIT) throw new PlanProviderError('daily_limit');
    }
    throw new TrainingRequestError('A plan is already generating, was recently requested, or this draft changed. Wait a minute, then reload.', 409);
  }
  return saved;
}

// Settle accounting before saving a result, including failed/invalid responses.
// If this write or any later write fails, the existing full reservation remains.
// Block deletion or intake edits never delete this ledger.
export async function settlePlanUsage(user: AppUser, id: string, result: Awaited<ReturnType<typeof requestOpenAIPlan>> | PlanProviderError) {
  const usage = result.usage;
  const settled = usage !== null && usageWithinReservation(usage);
  await getDb().update(aiUsage).set({
    status: settled ? 'settled' : 'uncertain', finishedAt: new Date().toISOString(),
    chargedMicrodollars: usage ? (settled ? estimatedCost(usage) : Math.max(REQUEST_RESERVE_MICRODOLLARS, estimatedCost(usage))) : REQUEST_RESERVE_MICRODOLLARS,
    inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
    outcome: result instanceof PlanProviderError ? result.code : result.output.outcome,
  }).where(and(eq(aiUsage.id, id), eq(aiUsage.ownerId, user.userId), eq(aiUsage.status, 'reserved'))).run();
}
export async function finishPlanGeneration(user: AppUser, blockId: string, id: string, result: Awaited<ReturnType<typeof requestOpenAIPlan>> | PlanProviderError): Promise<Plan> {
  const current = await userPlan(user, blockId);
  const previous = current.generation;
  if (!previous || previous.id !== id || previous.status !== 'generating') throw new TrainingRequestError('The intake changed while generating. Reload; no workouts were saved.', 409);
  const generation: Generation = result instanceof PlanProviderError
    ? { ...previous, status: 'failed', finishedAt: new Date().toISOString(), error: result.message, usage: result.usage, ...(result.validationFailure ? { validationFailure: result.validationFailure } : {}) }
    : { ...previous, ...result, status: result.output.outcome === 'plan' ? 'review' : 'clarification', finishedAt: new Date().toISOString(), error: null };
  const saved = await getDb().update(plans).set({ generation, version: current.version + 1, updatedAt: new Date().toISOString() }).where(and(
    eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, current.version), eq(plans.status, 'draft'),
    sql`json_extract(${plans.generation}, '$.id') = ${id}`, sql`json_extract(${plans.generation}, '$.status') = 'generating'`,
  )).returning().get();
  if (!saved) throw new TrainingRequestError('The intake changed while generating. Reload; no workouts were saved.', 409);
  const { ownerId: _ownerId, ...block } = saved;
  return block;
}
export async function acceptGeneratedPlan(user: AppUser, blockId: string, version: number, generationId: string): Promise<Plan> {
  const block = await userPlan(user, blockId), draft = block.generation;
  // Repeated delivery of the same acceptance is safe and creates no duplicates.
  if (draft?.id === generationId && draft.status === 'accepted') {
    const { ownerId: _ownerId, ...result } = block; return result;
  }
  if (block.status !== 'draft' || block.version !== version || !block.setup || draft?.id !== generationId || draft.status !== 'review' || !draft.output)
    throw new TrainingRequestError('This draft changed or is not ready. Reload and review it again before accepting.', 409);
  if (JSON.stringify(block.setup) !== JSON.stringify(draft.setupSnapshot)) throw new TrainingRequestError('Your intake changed. Generate and review a fresh draft.', 409);
  if (block.setup.goal.startDate < centralToday()) throw new TrainingRequestError('This plan starts in the past. Update the intake and generate a fresh draft.', 409);
  let output;
  try { output = validatePlanOutput(draft.output, draft.input, draft.provider !== 'simulation' && requiresAssessment(draft.promptVersion)); if (draft.calculationVersion) verifyCalculatedMeasurements(output, draft.input); }
  catch { throw new TrainingRequestError('This draft did not pass validation. Generate a fresh draft.', 409); }
  const timestamp = new Date().toISOString(), token = crypto.randomUUID();
  const generation: Generation = { ...draft, output, status: 'accepted', acceptedAt: timestamp };
  const database = getDb();
  // Every insert is conditional on this batch's unique token. A losing version
  // check inserts nothing. D1 batch rollback prevents partially saved schedules.
  const condition = and(eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, version + 1), sql`json_extract(${plans.generation}, '$.acceptanceToken') = ${token}`);
  const reserve = database.update(plans).set({ generation: { ...draft, acceptanceToken: token } as Generation, version: version + 1, updatedAt: timestamp })
    .where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, version), eq(plans.status, 'draft'),
      sql`json_extract(${plans.generation}, '$.id') = ${generationId}`, sql`json_extract(${plans.generation}, '$.status') = 'review'`,
      sql`not exists (select 1 from workouts w where w.plan_id = ${blockId})`, sql`not exists (select 1 from training_rest_days r where r.plan_id = ${blockId})`)).returning({ id: plans.id });
  const inserts = output.sessions.map(session => {
    const w = workoutForSession(session);
    return database.insert(workouts).select(database.select({
      id: sql<string>`${crypto.randomUUID()}`.as('id'), planId: plans.id,
      date: sql<string>`${w.date}`.as('date'), phase: sql<string>`${w.phase}`.as('phase'), type: sql<string>`${w.type}`.as('type'),
      plannedWorkout: sql<string>`${w.plannedWorkout}`.as('plannedWorkout'), targetPace: sql<string>`${w.targetPace}`.as('targetPace'),
      planStructure: sql<import('./workout-structure').WorkoutStructure | null>`${JSON.stringify(w.planStructure)}`.as('planStructure'),
      done: sql<boolean>`0`.as('done'), actualDistance: sql<number | null>`null`.as('actualDistance'),
      plannedDistance: sql<number | null>`${w.plannedDistance ?? null}`.as('plannedDistance'), plannedDurationSeconds: sql<number | null>`${w.plannedDurationSeconds ?? null}`.as('plannedDurationSeconds'),
      actualDurationSeconds: sql<number | null>`null`.as('actualDurationSeconds'), targetMetric: sql<'distance' | 'duration'>`${w.targetMetric}`.as('targetMetric'),
      plannedPaceSecondsPerMile: sql<number | null>`${w.plannedPaceSecondsPerMile ?? null}`.as('plannedPaceSecondsPerMile'), actualPaceSecondsPerMile: sql<number | null>`null`.as('actualPaceSecondsPerMile'),
      actualPace: sql<string>`''`.as('actualPace'), resultOrigins: sql<Record<string, number> | null>`null`.as('resultOrigins'), effort: sql<number | null>`null`.as('effort'), pain: sql<string>`''`.as('pain'), notes: sql<string>`''`.as('notes'),
      sourceRow: sql<number | null>`null`.as('sourceRow'), originalSource: sql<Record<string, unknown>>`${JSON.stringify({ generator: draft.validatorVersion, generationId, provider: draft.provider ?? 'openai', session })}`.as('originalSource'),
      version: sql<number>`1`.as('version'), updatedAt: sql<string>`${timestamp}`.as('updatedAt'),
    }).from(plans).where(condition));
  });
  const rests = scheduleDays(draft.input).filter(day => day.kind === 'rest').map(day => database.insert(restDays).select(database.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), planId: plans.id, date: sql<string>`${day.date}`.as('date'), version: sql<number>`1`.as('version'), updatedAt: sql<string>`${timestamp}`.as('updatedAt'),
  }).from(plans).where(condition)));
  const raceLabel = raceDistanceLabel(draft.input.goal.distanceMeters / 1000);
  const finalize = database.update(plans).set({ generation, paceGuide: [{ type: draft.provider === 'simulation' ? `SIMULATION · Example ${raceLabel}` : `${raceLabel} plan`, target: draft.input.goal.paceGuidance === 'effort' ? 'Effort based' : 'Performance based', rule: output.goalAssessment }], updatedAt: timestamp }).where(condition).returning({ id: plans.id });
  const result = await database.batch([reserve, ...inserts, ...rests, finalize]);
  if (!(result[0] as { id: string }[]).length) throw new TrainingRequestError('This draft changed in another tab. Reload before accepting.', 409);
  const { ownerId: _ownerId, ...saved } = await userPlan(user, blockId);
  return saved;
}

// A single statement captures the owned block plus every child ID/version.
// The confirmation digest is compact; the full revisions stay server-side.
function workoutDeletionRevision(blockId: string) {
  return sql<string>`(select json_group_array(json_array(id, version)) from (select id, version from workouts where plan_id = ${blockId} order by id))`;
}
function restDeletionRevision(blockId: string) {
  return sql<string>`(select json_group_array(json_array(id, version)) from (select id, version from training_rest_days where plan_id = ${blockId} order by id))`;
}
async function blockDeletionSnapshot(user: AppUser, blockId: string) {
  const snapshot = await getDb().select({ block: plans, workoutRevision: workoutDeletionRevision(blockId), restRevision: restDeletionRevision(blockId) })
    .from(plans).where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId))).get();
  if (!snapshot) throw new TrainingRequestError('This training block is unavailable.', 404);
  const signature = JSON.stringify({ id: blockId, version: snapshot.block.version, name: snapshot.block.raceName, status: snapshot.block.status, workouts: snapshot.workoutRevision, restDays: snapshot.restRevision });
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature)));
  return { ...snapshot, revision: Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function previewBlockDeletion(user: AppUser, blockId: string): Promise<BlockDeletionPreview> {
  const snapshot = await blockDeletionSnapshot(user, blockId);
  return { id: blockId, name: snapshot.block.raceName, status: snapshot.block.status, version: snapshot.block.version,
    workoutCount: JSON.parse(snapshot.workoutRevision).length, restDayCount: JSON.parse(snapshot.restRevision).length, revision: snapshot.revision };
}
export async function deleteBlock(user: AppUser, blockId: string, input: DeleteBlockInput) {
  const snapshot = await blockDeletionSnapshot(user, blockId), block = snapshot.block;
  if (block.status === 'active') throw new TrainingRequestError('Archive the active block before permanently deleting it.', 409);
  if (input.confirmation !== block.raceName) throw new TrainingRequestError('Type the exact block name to confirm permanent deletion.', 400);
  if (input.version !== block.version || input.revision !== snapshot.revision) throw new TrainingRequestError('This block or its workouts changed. Close and reopen the deletion details before continuing.', 409);
  const database = getDb(), token = crypto.randomUUID();
  // This unique token exists only inside the atomic batch. A losing reservation
  // cannot delete children. Existing alteration triggers preserve the token even
  // as they increment the parent's version while generated children are removed.
  const ownsReservation = and(eq(plans.id, blockId), eq(plans.ownerId, user.userId), sql`json_extract(${plans.generation}, '$.deletionToken') = ${token}`);
  const childGuard = sql`exists (select 1 from training_plans where ${ownsReservation})`;
  const reserved = database.update(plans).set({ generation: sql`json_set(coalesce(${plans.generation}, '{}'), '$.deletionToken', ${token})`, version: block.version + 1 })
    .where(and(eq(plans.id, blockId), eq(plans.ownerId, user.userId), eq(plans.version, input.version), ne(plans.status, 'active'),
      eq(plans.raceName, input.confirmation), sql`${workoutDeletionRevision(blockId)} = ${snapshot.workoutRevision}`, sql`${restDeletionRevision(blockId)} = ${snapshot.restRevision}`))
    .returning({ id: plans.id });
  const marker = database.insert(accountState).select(database.select({ ownerId: plans.ownerId, initializedAt: sql<string>`${new Date().toISOString()}`.as('initializedAt') }).from(plans).where(ownsReservation)).onConflictDoNothing();
  const result = await database.batch([
    reserved, marker,
    database.delete(workouts).where(and(eq(workouts.planId, blockId), childGuard)),
    database.delete(restDays).where(and(eq(restDays.planId, blockId), childGuard)),
    database.delete(plans).where(ownsReservation).returning({ id: plans.id }),
  ]);
  if (!(result[0] as { id: string }[]).length || !(result[4] as { id: string }[]).length)
    throw new TrainingRequestError('This block changed in another tab. Close and reopen the deletion details before continuing.', 409);
  return { deleted: true, id: blockId };
}

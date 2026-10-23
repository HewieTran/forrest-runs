import { env } from 'cloudflare:workers';
import { and, asc, eq, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { plans, workouts } from '../db/schema';
import {
  addDays,
  centralToday,
  type AppData,
  type Plan,
  type Workout,
  type WorkoutInput,
  validateWorkout,
} from './domain';
import type { ChatGPTUser } from '../app/chatgpt-auth';
import type { TrainingBackupV2 } from './backups';
import { TrainingRequestError } from './training-errors';

type Seed = Pick<Plan, 'raceName' | 'raceDate' | 'paceGuide' | 'sourceName'> & {
  workouts: Omit<Workout, 'id' | 'planId' | 'updatedAt' | 'version'>[];
};
async function loadOwnerSeed(user: ChatGPTUser): Promise<Seed | null> {
  // Only the configured owner can receive the private spreadsheet import.
  const runtimeVariables = env as unknown as Record<string, string | undefined>;
  if (
    !runtimeVariables.TRAINING_SEED_OWNER ||
    user.email.toLowerCase() !==
      runtimeVariables.TRAINING_SEED_OWNER.toLowerCase()
  )
    return null;
  const encodedSeed = Array.from(
    { length: 10 },
    (_, chunkIndex) =>
      runtimeVariables[`TRAINING_SEED_${chunkIndex + 1}`] ?? '',
  ).join('');
  if (!encodedSeed) return null;
  const compressedBytes = Uint8Array.from(atob(encodedSeed), (character) =>
    character.charCodeAt(0),
  );
  const decompressedStream = new Blob([compressedBytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const seed = JSON.parse(
    await new Response(decompressedStream).text(),
  ) as Seed;
  if (!Array.isArray(seed.workouts) || seed.workouts.length > 3000)
    throw new Error('The initial training import is invalid.');
  for (const workout of seed.workouts)
    validateWorkout({ ...workout, version: 1 });
  return seed;
}
export async function userPlan(user: ChatGPTUser, blockId?: string) {
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
  const seed = await loadOwnerSeed(user);
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
  if (!env.DB) throw new Error('The training database is unavailable.');
  const statements = [
    env.DB.prepare(
      'INSERT INTO training_plans (id,owner_id,race_name,race_date,pace_guide,source_name,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)',
    ).bind(
      planId,
      user.userId,
      initialPlan.raceName,
      initialPlan.raceDate,
      JSON.stringify(initialPlan.paceGuide),
      initialPlan.sourceName,
      timestamp,
      timestamp,
    ),
  ];
  for (const workout of seed?.workouts ?? [])
    statements.push(
      env.DB.prepare(
        'INSERT INTO workouts (id,plan_id,date,phase,type,planned_workout,target_pace,done,actual_distance,actual_pace,effort,pain,notes,source_row,original_source,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
      ).bind(
        `${planId}:row:${workout.sourceRow}`,
        planId,
        workout.date,
        workout.phase,
        workout.type,
        workout.plannedWorkout,
        workout.targetPace,
        workout.done ? 1 : 0,
        workout.actualDistance,
        workout.actualPace,
        workout.effort,
        workout.pain,
        workout.notes,
        workout.sourceRow,
        JSON.stringify(workout.originalSource),
        timestamp,
      ),
    );
  try {
    // Create the plan and its workouts atomically, without partial imports.
    await env.DB.batch(statements);
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
export async function loadTraining(user: ChatGPTUser, blockId?: string): Promise<AppData> {
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

export async function writablePlan(user: ChatGPTUser, blockId?: string) {
  const selectedPlan = await userPlan(user, blockId);
  if (blockId === undefined) {
    const anotherBlock = await getDb().select({ id: plans.id }).from(plans)
      .where(and(eq(plans.ownerId, user.userId), ne(plans.id, selectedPlan.id)))
      .limit(1).get();
    // Old tabs must reload rather than silently save into a different active block.
    if (anotherBlock) throw new TrainingRequestError('Select a training block before saving. Reload to continue.', 409);
  }
  return selectedPlan;
}

export async function listBlocks(user: ChatGPTUser): Promise<Plan[]> {
  await userPlan(user);
  const ownedBlocks = await getDb().select().from(plans)
    .where(eq(plans.ownerId, user.userId))
    .orderBy(asc(plans.createdAt), asc(plans.id));
  return ownedBlocks.map(({ ownerId: _ownerId, ...block }) => block);
}

export async function exportTraining(user: ChatGPTUser): Promise<TrainingBackupV2> {
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
  user: ChatGPTUser,
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
export async function addWorkout(user: ChatGPTUser, input: WorkoutInput, blockId?: string) {
  const plan = await writablePlan(user, blockId);
  return getDb()
    .insert(workouts)
    .values({
      ...input,
      id: crypto.randomUUID(),
      planId: plan.id,
      version: 1,
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

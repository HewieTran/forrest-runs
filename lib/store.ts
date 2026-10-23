import { and, asc, eq, ne } from 'drizzle-orm';
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

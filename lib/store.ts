import { env } from 'cloudflare:workers';
import { and, asc, eq } from 'drizzle-orm';
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
export async function userPlan(user: ChatGPTUser) {
  const database = getDb();
  let plan = await database
    .select()
    .from(plans)
    .where(eq(plans.ownerId, user.userId))
    .get();
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
      .get();
    if (!plan) throw error;
  }
  return (await database
    .select()
    .from(plans)
    .where(eq(plans.ownerId, user.userId))
    .get())!;
}
export async function loadTraining(user: ChatGPTUser): Promise<AppData> {
  const ownedPlan = await userPlan(user);
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
export async function saveWorkout(
  user: ChatGPTUser,
  workoutId: string,
  input: WorkoutInput,
) {
  const plan = await userPlan(user);
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
export async function addWorkout(user: ChatGPTUser, input: WorkoutInput) {
  const plan = await userPlan(user);
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

import { env } from 'cloudflare:workers';
import { validateWorkout, type Plan, type Workout } from '../lib/domain';

// D1 and private runtime configuration stay inside this first-load adapter.
type InitialTrainingPlan = Omit<Plan, 'status' | 'version'> & { ownerId: string };

type TrainingSeed = Pick<Plan, 'raceName' | 'raceDate' | 'paceGuide' | 'sourceName'> & {
  workouts: Omit<Workout, 'id' | 'planId' | 'updatedAt' | 'version'>[];
};
export async function loadOwnerSeed(email: string): Promise<TrainingSeed | null> {
  // Only the configured owner can receive the private spreadsheet import.
  const runtimeVariables = env as unknown as Record<string, string | undefined>;
  if (
    !runtimeVariables.TRAINING_SEED_OWNER ||
    email.toLowerCase() !==
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
  ) as TrainingSeed;
  if (!Array.isArray(seed.workouts) || seed.workouts.length > 3000)
    throw new Error('The initial training import is invalid.');
  for (const workout of seed.workouts)
    validateWorkout({ ...workout, version: 1 });
  return seed;
}
export async function insertInitialTraining(
  plan: InitialTrainingPlan,
  initialWorkouts: TrainingSeed['workouts'],
) {
  if (!env.DB) throw new Error('The training database is unavailable.');
  const statements = [
    env.DB.prepare(
      'INSERT INTO training_plans (id,owner_id,race_name,race_date,pace_guide,source_name,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)',
    ).bind(
      plan.id,
      plan.ownerId,
      plan.raceName,
      plan.raceDate,
      JSON.stringify(plan.paceGuide),
      plan.sourceName,
      plan.createdAt,
      plan.updatedAt,
    ),
  ];
  for (const workout of initialWorkouts)
    statements.push(
      env.DB.prepare(
        'INSERT INTO workouts (id,plan_id,date,phase,type,planned_workout,target_pace,done,actual_distance,actual_pace,effort,pain,notes,source_row,original_source,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
      ).bind(
        `${plan.id}:row:${workout.sourceRow}`,
        plan.id,
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
        plan.updatedAt,
      ),
    );
  // D1 runs this batch atomically, preserving the existing import behavior.
  await env.DB.batch(statements);
}

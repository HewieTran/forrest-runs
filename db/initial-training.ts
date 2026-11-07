import { getRuntimeVariables } from '@forrest/platform';
import { getDb } from './index';
import { plans, workouts, accountState } from './schema';
import { EMPTY_WORKOUT_MEASUREMENTS, validateWorkout, type Plan, type Workout } from '../lib/domain';

// Private seed configuration stays behind the runtime adapter.
type InitialTrainingPlan = Omit<Plan, 'status' | 'version'> & { ownerId: string };

type TrainingSeed = Pick<Plan, 'raceName' | 'raceDate' | 'paceGuide' | 'sourceName'> & {
  workouts: Omit<Workout, 'id' | 'planId' | 'updatedAt' | 'version'>[];
};
export async function loadOwnerSeed(email: string): Promise<TrainingSeed | null> {
  // Only the configured owner can receive the private spreadsheet import.
  const runtimeVariables = getRuntimeVariables();
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
  seed.workouts = seed.workouts.map(workout => {
    const validated = validateWorkout({ ...workout, version: 1 });
    // Preserve the source description and historical values exactly; only add
    // validated measurements, without extracting numbers from source prose.
    return { ...workout,
      plannedDistance: validated.plannedDistance ?? EMPTY_WORKOUT_MEASUREMENTS.plannedDistance,
      plannedDurationSeconds: validated.plannedDurationSeconds ?? EMPTY_WORKOUT_MEASUREMENTS.plannedDurationSeconds,
      actualDurationSeconds: validated.actualDurationSeconds ?? EMPTY_WORKOUT_MEASUREMENTS.actualDurationSeconds,
      targetMetric: validated.targetMetric ?? EMPTY_WORKOUT_MEASUREMENTS.targetMetric,
    };
  });
  return seed;
}
export async function insertInitialTraining(
  plan: InitialTrainingPlan,
  initialWorkouts: TrainingSeed['workouts'],
) {
  const database = getDb();
  const workoutStatements = initialWorkouts.map(workout => database.insert(workouts).values({
    ...workout,
    id: `${plan.id}:row:${workout.sourceRow}`,
    planId: plan.id,
    version: 1,
    updatedAt: plan.updatedAt,
  }));
  await database.batch([
    database.insert(accountState).values({ ownerId: plan.ownerId, initializedAt: plan.createdAt }),
    database.insert(plans).values({ ...plan, version: 1 }),
    ...workoutStatements,
  ]);
}

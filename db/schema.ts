import {
  integer,
  real,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { BLOCK_STATUSES } from '../lib/domain';
import type { Generation } from '../lib/planner';
import type { BlockSetup } from '../lib/setup';
import type { ResultOrigins } from '../lib/workout-completion';
import type { WorkoutStructure } from '../lib/workout-structure';

// A user can own many blocks; the partial index permits only one active block.
export const plans = sqliteTable('training_plans', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  status: text('status', { enum: BLOCK_STATUSES }).notNull().default('active'),
  setup: text('setup', { mode: 'json' }).$type<BlockSetup>(),
  generation: text('generation', { mode: 'json' }).$type<Generation>(),
  raceName: text('race_name').notNull(),
  raceDate: text('race_date').notNull(),
  paceGuide: text('pace_guide', { mode: 'json' })
    .notNull()
    .$type<{ type: string; target: string; rule: string }[]>(),
  sourceName: text('source_name'),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('training_plans_owner_created_idx').on(table.ownerId, table.createdAt, table.id),
  uniqueIndex('training_plans_one_active_per_owner_idx')
    .on(table.ownerId)
    .where(sql`${table.status} = 'active'`),
]);
export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    // Each workout belongs to one plan through this foreign key.
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    date: text('date').notNull(),
    phase: text('phase').notNull(),
    type: text('type').notNull(),
    plannedWorkout: text('planned_workout').notNull(),
    targetPace: text('target_pace').notNull(),
    planStructure: text('plan_structure', { mode: 'json' }).$type<WorkoutStructure>(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    // SQL NULL means unknown, which is distinct from a recorded zero.
    actualDistance: real('actual_distance'),
    // Nullable additive fields: no targets or durations are inferred on upgrade.
    plannedDistance: real('planned_distance'),
    plannedDurationSeconds: integer('planned_duration_seconds'),
    actualDurationSeconds: integer('actual_duration_seconds'),
    targetMetric: text('target_metric', { enum: ['distance', 'duration'] }),
    plannedPaceSecondsPerMile: real('planned_pace_seconds_per_mile'),
    actualPaceSecondsPerMile: real('actual_pace_seconds_per_mile'),
    actualPace: text('actual_pace').notNull().default(''),
    resultOrigins: text('result_origins', { mode: 'json' }).$type<ResultOrigins>(),
    effort: integer('effort'),
    pain: text('pain').notNull().default(''),
    notes: text('notes').notNull().default(''),
    sourceRow: integer('source_row'),
    originalSource: text('original_source', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    // Used to detect conflicting edits from another browser tab.
    version: integer('version').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('workouts_plan_date_idx').on(table.planId, table.date)],
);

// Rest is a schedule designation, never a completed workout. The block foreign
// key supplies account ownership; one row per block/date prevents duplicates.
export const restDays = sqliteTable('training_rest_days', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  date: text('date').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('training_rest_days_plan_date_idx').on(table.planId, table.date)]);

// Initialization is account state, independent of how many blocks remain.
export const accountState = sqliteTable('training_account_state', {
  ownerId: text('owner_id').primaryKey(),
  initializedAt: text('initialized_at').notNull(),
});

// Operational accounting survives block deletion and is never restored from a
// training backup. Store no prompts, fitness data, API keys or provider bodies.
export const aiUsage = sqliteTable('training_ai_usage', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  blockId: text('block_id').notNull(), // Deliberately no cascading foreign key.
  period: text('period').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  model: text('model').notNull(),
  pricingVersion: text('pricing_version').notNull(),
  status: text('status', { enum: ['reserved', 'settled', 'uncertain'] }).notNull(),
  reservedMicrodollars: integer('reserved_microdollars').notNull(),
  chargedMicrodollars: integer('charged_microdollars').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  outcome: text('outcome'),
}, table => [index('training_ai_usage_period_idx').on(table.period, table.status),
  index('training_ai_usage_owner_started_idx').on(table.ownerId, table.startedAt)]);

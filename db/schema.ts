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

// A user can own many blocks; the partial index permits only one active block.
export const plans = sqliteTable('training_plans', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  status: text('status', { enum: BLOCK_STATUSES }).notNull().default('active'),
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
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    // SQL NULL means unknown, which is distinct from a recorded zero.
    actualDistance: real('actual_distance'),
    actualPace: text('actual_pace').notNull().default(''),
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

CREATE TABLE `training_rest_days` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_rest_days_plan_date_idx` ON `training_rest_days` (`plan_id`,`date`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `planned_distance` real;--> statement-breakpoint
ALTER TABLE `workouts` ADD `planned_duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `actual_duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `target_metric` text;
--> statement-breakpoint
-- Preserve exclusivity even for maintenance SQL or an older Worker deployment.
CREATE TRIGGER workouts_reject_rest_insert BEFORE INSERT ON workouts
WHEN EXISTS (SELECT 1 FROM training_rest_days WHERE plan_id = NEW.plan_id AND date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'A rest day cannot contain a workout.'); END;
--> statement-breakpoint
CREATE TRIGGER workouts_reject_rest_update BEFORE UPDATE OF plan_id, date ON workouts
WHEN EXISTS (SELECT 1 FROM training_rest_days WHERE plan_id = NEW.plan_id AND date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'A rest day cannot contain a workout.'); END;
--> statement-breakpoint
CREATE TRIGGER rest_days_reject_workout_insert BEFORE INSERT ON training_rest_days
WHEN EXISTS (SELECT 1 FROM workouts WHERE plan_id = NEW.plan_id AND date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'A workout day cannot be marked as rest.'); END;
--> statement-breakpoint
CREATE TRIGGER rest_days_reject_workout_update BEFORE UPDATE OF plan_id, date ON training_rest_days
WHEN EXISTS (SELECT 1 FROM workouts WHERE plan_id = NEW.plan_id AND date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'A workout day cannot be marked as rest.'); END;

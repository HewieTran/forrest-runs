CREATE TABLE `training_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`race_name` text NOT NULL,
	`race_date` text NOT NULL,
	`pace_guide` text NOT NULL,
	`source_name` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_plans_owner_id_unique` ON `training_plans` (`owner_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`phase` text NOT NULL,
	`type` text NOT NULL,
	`planned_workout` text NOT NULL,
	`target_pace` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`actual_distance` real,
	`actual_pace` text DEFAULT '' NOT NULL,
	`effort` integer,
	`pain` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source_row` integer,
	`original_source` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workouts_plan_date_idx` ON `workouts` (`plan_id`,`date`);
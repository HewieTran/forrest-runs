DROP INDEX `training_plans_owner_id_unique`;--> statement-breakpoint
ALTER TABLE `training_plans` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX `training_plans_owner_created_idx` ON `training_plans` (`owner_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_plans_one_active_per_owner_idx` ON `training_plans` (`owner_id`) WHERE "training_plans"."status" = 'active';
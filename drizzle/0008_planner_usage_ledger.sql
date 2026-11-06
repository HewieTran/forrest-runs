CREATE TABLE `training_ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`block_id` text NOT NULL,
	`period` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`model` text NOT NULL,
	`pricing_version` text NOT NULL,
	`status` text NOT NULL,
	`reserved_microdollars` integer NOT NULL,
	`charged_microdollars` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`outcome` text
);
--> statement-breakpoint
CREATE INDEX `training_ai_usage_period_idx` ON `training_ai_usage` (`period`,`status`);--> statement-breakpoint
CREATE INDEX `training_ai_usage_owner_started_idx` ON `training_ai_usage` (`owner_id`,`started_at`);
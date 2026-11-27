ALTER TABLE training_plans ADD COLUMN goal_review text;
--> statement-breakpoint
ALTER TABLE training_ai_usage ADD COLUMN request_type text NOT NULL DEFAULT 'plan';

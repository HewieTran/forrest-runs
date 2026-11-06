ALTER TABLE `training_plans` ADD `generation` text;--> statement-breakpoint
CREATE TRIGGER generated_workout_insert AFTER INSERT ON workouts
WHEN json_extract((SELECT generation FROM training_plans WHERE id = NEW.plan_id), '$.status') = 'accepted'
BEGIN
  UPDATE training_plans SET generation = json_set(generation, '$.alteredAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.plan_id;
END;
--> statement-breakpoint
CREATE TRIGGER generated_workout_change AFTER UPDATE ON workouts
WHEN (OLD.date IS NOT NEW.date OR OLD.phase IS NOT NEW.phase OR OLD.type IS NOT NEW.type OR OLD.planned_workout IS NOT NEW.planned_workout OR OLD.target_pace IS NOT NEW.target_pace OR OLD.planned_distance IS NOT NEW.planned_distance OR OLD.planned_duration_seconds IS NOT NEW.planned_duration_seconds OR OLD.target_metric IS NOT NEW.target_metric OR OLD.planned_pace_seconds_per_mile IS NOT NEW.planned_pace_seconds_per_mile)
AND json_extract((SELECT generation FROM training_plans WHERE id = NEW.plan_id), '$.status') = 'accepted'
BEGIN
  UPDATE training_plans SET generation = json_set(generation, '$.alteredAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.plan_id;
END;
--> statement-breakpoint
CREATE TRIGGER generated_workout_delete AFTER DELETE ON workouts
WHEN json_extract((SELECT generation FROM training_plans WHERE id = OLD.plan_id), '$.status') = 'accepted'
BEGIN
  UPDATE training_plans SET generation = json_set(generation, '$.alteredAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.plan_id;
END;
--> statement-breakpoint
CREATE TRIGGER generated_rest_insert AFTER INSERT ON training_rest_days
WHEN json_extract((SELECT generation FROM training_plans WHERE id = NEW.plan_id), '$.status') = 'accepted'
BEGIN
  UPDATE training_plans SET generation = json_set(generation, '$.alteredAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.plan_id;
END;
--> statement-breakpoint
CREATE TRIGGER generated_rest_delete AFTER DELETE ON training_rest_days
WHEN json_extract((SELECT generation FROM training_plans WHERE id = OLD.plan_id), '$.status') = 'accepted'
BEGIN
  UPDATE training_plans SET generation = json_set(generation, '$.alteredAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.plan_id;
END;

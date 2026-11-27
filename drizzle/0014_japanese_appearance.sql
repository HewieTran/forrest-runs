-- SQLite requires a table rebuild to extend this CHECK. Copy every profile field
-- verbatim; do not change ownership, versions, names, colors or selected themes.
CREATE TABLE `training_profiles_next` (
 `owner_id` text PRIMARY KEY NOT NULL,
 `first_name` text,
 `last_name` text,
 `avatar_color` integer,
 `version` integer DEFAULT 1 NOT NULL,
 `updated_at` text NOT NULL,
 `appearance` text DEFAULT 'forest' NOT NULL CHECK (`appearance` IN ('forest','road','slate','japanese')),
 CONSTRAINT `profile_first_name_length` CHECK (`first_name` IS NULL OR length(`first_name`) <= 80),
 CONSTRAINT `profile_last_name_length` CHECK (`last_name` IS NULL OR length(`last_name`) <= 80),
 CONSTRAINT `profile_avatar_palette` CHECK (`avatar_color` IS NULL OR (`avatar_color` >= 0 AND `avatar_color` < 8)),
 CONSTRAINT `profile_version` CHECK (`version` >= 1)
);
--> statement-breakpoint
INSERT INTO `training_profiles_next` SELECT `owner_id`,`first_name`,`last_name`,`avatar_color`,`version`,`updated_at`,`appearance` FROM `training_profiles`;
--> statement-breakpoint
DROP TABLE `training_profiles`;
--> statement-breakpoint
ALTER TABLE `training_profiles_next` RENAME TO `training_profiles`;

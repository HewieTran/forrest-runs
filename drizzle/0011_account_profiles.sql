CREATE TABLE `training_profiles` (
  `owner_id` text PRIMARY KEY NOT NULL,
  `first_name` text,
  `last_name` text,
  `avatar_color` integer,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `profile_first_name_length` CHECK (`first_name` IS NULL OR length(`first_name`) <= 80),
  CONSTRAINT `profile_last_name_length` CHECK (`last_name` IS NULL OR length(`last_name`) <= 80),
  CONSTRAINT `profile_avatar_palette` CHECK (`avatar_color` IS NULL OR (`avatar_color` >= 0 AND `avatar_color` < 8)),
  CONSTRAINT `profile_version` CHECK (`version` >= 1)
);

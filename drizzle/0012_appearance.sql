ALTER TABLE `training_profiles` ADD `appearance` text DEFAULT 'forest' NOT NULL CHECK (`appearance` IN ('forest', 'road', 'slate'));

ALTER TABLE `user` ADD `preferred_salary_min` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `preferred_salary_max` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `preferred_location` text;--> statement-breakpoint
ALTER TABLE `user` ADD `preferred_remote` text;--> statement-breakpoint
ALTER TABLE `user` ADD `preferred_keywords` text;--> statement-breakpoint
ALTER TABLE `normalized_jobs` ADD `canonical_job_id` text REFERENCES `canonical_jobs`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `normalized_jobs` ADD `is_favorited` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_normalized_canonical_job_id` ON `normalized_jobs` (`canonical_job_id`);--> statement-breakpoint
CREATE INDEX `idx_normalized_user_favorited` ON `normalized_jobs` (`user_id`, `is_favorited`);

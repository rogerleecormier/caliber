CREATE INDEX `idx_normalized_canonical_stage` ON `normalized_jobs` (`canonical_job_id`,`current_stage`);--> statement-breakpoint
CREATE INDEX `idx_normalized_user_id` ON `normalized_jobs` (`user_id`);
DROP INDEX IF EXISTS `ux_normalized_jobs_user_url`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_normalized_jobs_user_url` ON `normalized_jobs` (`user_id`, `canonical_source_url`) WHERE `canonical_source_url` != 'text-input';

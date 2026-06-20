-- Unify discovery/crawler agents with search & personalized jobs.
-- Adds cross-source dedup (job_sources), per-user canonical job relationship (user_jobs),
-- canonical search agents, normalized job fields, and profile preference fields.

-- ── Normalized fields on the canonical jobs table (additive, nullable) ──
ALTER TABLE `jobs` ADD `location` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_min` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_max` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_currency` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `employment_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `seniority_level` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `company_normalized` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `dedupe_key` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `embedded_at` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_dedupe_key_idx` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_embedded_at_idx` ON `jobs` (`embedded_at`);--> statement-breakpoint

-- ── Cross-source dedup: one canonical job, many source URLs ──
CREATE TABLE `job_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`pay_range` text,
	`post_date` integer,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `job_sources_source_url_unique` ON `job_sources` (`source_url`);--> statement-breakpoint
CREATE INDEX `job_sources_job_id_idx` ON `job_sources` (`job_id`);--> statement-breakpoint

-- Backfill: one source row per existing canonical job using its primary source URL.
INSERT INTO `job_sources` (`job_id`, `source_name`, `source_url`, `pay_range`, `post_date`, `first_seen_at`, `last_seen_at`)
SELECT `id`, `source_name`, `source_url`, `pay_range`, `post_date`,
       COALESCE(`created_at`, (unixepoch())), COALESCE(`updated_at`, (unixepoch()))
FROM `jobs`;--> statement-breakpoint

-- ── Search agents (canonical-DB queries; generalizes linkedin_saved_searches) ──
CREATE TABLE `search_agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`criteria` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`auto_favorite_threshold` integer DEFAULT 75 NOT NULL,
	`last_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

-- ── Per-user relationship to a canonical job (replaces linkedin_job_results) ──
CREATE TABLE `user_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`relationship` text DEFAULT 'manual' NOT NULL,
	`favorited` integer DEFAULT false NOT NULL,
	`auto_favorited` integer DEFAULT false NOT NULL,
	`search_agent_id` integer,
	`recommendation_score` integer,
	`ats_score` integer,
	`career_score` integer,
	`outlook_score` integer,
	`master_score` integer,
	`ats_reason` text,
	`career_reason` text,
	`outlook_reason` text,
	`is_unicorn` integer DEFAULT false NOT NULL,
	`unicorn_reason` text,
	`status` text DEFAULT 'Analyzed' NOT NULL,
	`scored_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_agent_id`) REFERENCES `search_agents`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_jobs_user_job_unique` ON `user_jobs` (`user_id`, `job_id`);--> statement-breakpoint
CREATE INDEX `user_jobs_user_id_idx` ON `user_jobs` (`user_id`);--> statement-breakpoint

-- ── Profile preference fields for personalized recommendations ──
ALTER TABLE `master_resume` ADD `preferred_titles` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `seniority_level` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `preferred_industries` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `excluded_industries` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `preferred_locations` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `remote_preference` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `salary_min` integer;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `salary_max` integer;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `salary_currency` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `employment_types` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `excluded_companies` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `excluded_keywords` text;--> statement-breakpoint
ALTER TABLE `master_resume` ADD `profile_embedded_at` text;

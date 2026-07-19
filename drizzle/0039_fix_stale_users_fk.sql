-- Rebuild tables whose user_id FK still points at the old `users` table
-- (pre-better-auth). The Drizzle schema has referenced `user` for a while;
-- these four tables' on-disk DDL was never migrated, so any FK-enforced
-- insert/update against them fails for real (better-auth) user ids.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint

CREATE TABLE `__new_master_resume` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text REFERENCES `user`(`id`),
  `full_name` text NOT NULL,
  `email` text,
  `phone` text,
  `linkedin` text,
  `website` text,
  `summary` text,
  `competencies` text,
  `tools` text,
  `experience` text,
  `education` text,
  `certifications` text,
  `personal_projects` text,
  `raw_text` text,
  `updated_at` text
);
--> statement-breakpoint
INSERT INTO `__new_master_resume` SELECT `id`, `user_id`, `full_name`, `email`, `phone`, `linkedin`, `website`, `summary`, `competencies`, `tools`, `experience`, `education`, `certifications`, `personal_projects`, `raw_text`, `updated_at` FROM `master_resume`;
--> statement-breakpoint
DROP TABLE `master_resume`;
--> statement-breakpoint
ALTER TABLE `__new_master_resume` RENAME TO `master_resume`;
--> statement-breakpoint
CREATE UNIQUE INDEX `master_resume_user_id_unique` ON `master_resume` (`user_id`);
--> statement-breakpoint

CREATE TABLE `__new_analytics_summary` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text REFERENCES `user`(`id`),
  `period` text NOT NULL,
  `top_jd_keywords` text,
  `top_resume_keywords` text,
  `top_job_titles` text,
  `top_industries` text,
  `average_match_score` real,
  `total_analyses` integer,
  `total_resumes_generated` integer,
  `total_applied` integer DEFAULT 0,
  `total_pursued` integer DEFAULT 0,
  `updated_at` text
);
--> statement-breakpoint
INSERT INTO `__new_analytics_summary` SELECT `id`, `user_id`, `period`, `top_jd_keywords`, `top_resume_keywords`, `top_job_titles`, `top_industries`, `average_match_score`, `total_analyses`, `total_resumes_generated`, `total_applied`, `total_pursued`, `updated_at` FROM `analytics_summary`;
--> statement-breakpoint
DROP TABLE `analytics_summary`;
--> statement-breakpoint
ALTER TABLE `__new_analytics_summary` RENAME TO `analytics_summary`;
--> statement-breakpoint

CREATE TABLE `__new_search_configurations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`),
  `name` text NOT NULL,
  `criteria` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `run_interval_hours` integer DEFAULT 24 NOT NULL,
  `sources` text DEFAULT '["linkedin", "greenhouse", "lever"]' NOT NULL,
  `employment_type` text,
  `last_run_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_search_configurations` SELECT `id`, `user_id`, `name`, `criteria`, `is_active`, `run_interval_hours`, `sources`, `employment_type`, `last_run_at`, `created_at`, `updated_at` FROM `search_configurations`;
--> statement-breakpoint
DROP TABLE `search_configurations`;
--> statement-breakpoint
ALTER TABLE `__new_search_configurations` RENAME TO `search_configurations`;
--> statement-breakpoint

CREATE TABLE `__new_job_analyses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text REFERENCES `user`(`id`),
  `job_url` text NOT NULL,
  `job_title` text,
  `company` text,
  `industry` text,
  `location` text,
  `jd_text` text,
  `match_score` integer,
  `gap_analysis` text,
  `recommendations` text,
  `pursue` integer,
  `pursue_justification` text,
  `keywords` text,
  `strategy_note` text,
  `personal_interest` text,
  `career_analysis` text,
  `insights` text,
  `applied` integer DEFAULT 0,
  `application_status` text,
  `applied_at` text,
  `created_at` text
);
--> statement-breakpoint
INSERT INTO `__new_job_analyses` SELECT `id`, `user_id`, `job_url`, `job_title`, `company`, `industry`, `location`, `jd_text`, `match_score`, `gap_analysis`, `recommendations`, `pursue`, `pursue_justification`, `keywords`, `strategy_note`, `personal_interest`, `career_analysis`, `insights`, `applied`, `application_status`, `applied_at`, `created_at` FROM `job_analyses`;
--> statement-breakpoint
DROP TABLE `job_analyses`;
--> statement-breakpoint
ALTER TABLE `__new_job_analyses` RENAME TO `job_analyses`;
--> statement-breakpoint

PRAGMA foreign_keys=ON;

--> statement-breakpoint
CREATE TABLE `app_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `linkedin_retention_days` integer DEFAULT 14 NOT NULL,
  `linkedin_auto_prune` integer DEFAULT 1 NOT NULL,
  `linkedin_allow_all_users_view` integer DEFAULT 0 NOT NULL,
  `linkedin_search_cron_frequency` text DEFAULT 'daily' NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `linkedin_saved_searches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `name` text NOT NULL,
  `criteria` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `last_run_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `linkedin_job_results` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `saved_search_id` integer,
  `external_job_id` text NOT NULL,
  `title` text NOT NULL,
  `company` text NOT NULL,
  `location` text NOT NULL,
  `source_url` text NOT NULL,
  `canonical_source_url` text NOT NULL,
  `source_name` text DEFAULT 'LinkedIn' NOT NULL,
  `search_url` text,
  `criteria` text NOT NULL,
  `salary` text,
  `snippet` text,
  `description` text,
  `post_date_text` text,
  `workplace_type` text,
  `ats_score` integer,
  `career_score` integer,
  `outlook_score` integer,
  `master_score` integer,
  `ats_reason` text,
  `career_reason` text,
  `outlook_reason` text,
  `is_unicorn` integer DEFAULT 0 NOT NULL,
  `unicorn_reason` text,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`saved_search_id`) REFERENCES `linkedin_saved_searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_job_results_user_canonical_url_unique` ON `linkedin_job_results` (`user_id`,`canonical_source_url`);
--> statement-breakpoint
INSERT INTO `app_settings` (
  `id`,
  `linkedin_retention_days`,
  `linkedin_auto_prune`,
  `linkedin_allow_all_users_view`,
  `linkedin_search_cron_frequency`,
  `updated_at`
) VALUES (1, 14, 1, 0, 'daily', CURRENT_TIMESTAMP);

-- master_resume.user_id still referenced the old `users` table (pre-better-auth).
-- The app has used `user` for a long time; this stale FK target caused every
-- insert/update on master_resume to fail with SQLITE_CONSTRAINT_FOREIGNKEY.
-- master_resume has no dependent tables, so it can be rebuilt in isolation.
--
-- Note: analytics_summary, search_configurations, and job_analyses have the
-- same stale `users` FK, but job_analyses/search_configurations have live
-- dependents (generated_documents, normalized_jobs) that D1 won't let us
-- detach (D1 always enforces foreign keys; PRAGMA foreign_keys=OFF is a
-- no-op on hosted D1). Fixing those requires a separate, larger migration
-- that also rebuilds their dependents — left for later.
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

-- Fold the legacy per-user linkedin_job_results / linkedin_saved_searches into the
-- canonical model: jobs + job_sources + user_jobs + search_agents.
-- Idempotent (INSERT OR IGNORE / NOT EXISTS) so it can run safely once.

-- Fallback category for migrated jobs (jobs.category_id is NOT NULL).
INSERT OR IGNORE INTO `categories` (`name`, `slug`, `description`)
VALUES ('Uncategorized', 'uncategorized', 'Auto-created for migrated jobs');

-- 1. Upsert one canonical job per distinct LinkedIn canonical URL not already present.
INSERT INTO `jobs` (`title`, `company`, `description`, `pay_range`,
                    `source_url`, `source_name`, `category_id`, `remote_type`,
                    `location`, `post_date`, `created_at`, `updated_at`)
SELECT ljr.`title`, ljr.`company`, ljr.`description`, ljr.`salary`,
       ljr.`canonical_source_url`, ljr.`source_name`,
       (SELECT `id` FROM `categories` ORDER BY `id` LIMIT 1), 'fully_remote',
       ljr.`location`, (unixepoch()), (unixepoch()), (unixepoch())
FROM `linkedin_job_results` ljr
WHERE NOT EXISTS (SELECT 1 FROM `jobs` j WHERE j.`source_url` = ljr.`canonical_source_url`)
GROUP BY ljr.`canonical_source_url`;

-- 2. Ensure every job (incl. the just-migrated ones) has a job_sources row.
INSERT OR IGNORE INTO `job_sources` (`job_id`, `source_name`, `source_url`, `pay_range`,
                                     `post_date`, `first_seen_at`, `last_seen_at`)
SELECT j.`id`, j.`source_name`, j.`source_url`, j.`pay_range`, j.`post_date`,
       (unixepoch()), (unixepoch())
FROM `jobs` j
WHERE NOT EXISTS (SELECT 1 FROM `job_sources` js WHERE js.`source_url` = j.`source_url`);

-- 3. Create per-user job rows carrying scores/status. Favorite anything past the
--    Analyzed/Archived stages (i.e. the user actively pursued it).
INSERT OR IGNORE INTO `user_jobs` (`user_id`, `job_id`, `relationship`, `favorited`,
                                   `auto_favorited`, `ats_score`, `career_score`,
                                   `outlook_score`, `master_score`, `ats_reason`,
                                   `career_reason`, `outlook_reason`, `is_unicorn`,
                                   `unicorn_reason`, `status`, `scored_at`,
                                   `created_at`, `updated_at`)
SELECT ljr.`user_id`, j.`id`, 'agent',
       CASE WHEN ljr.`status` NOT IN ('Analyzed', 'Archived') THEN 1 ELSE 0 END,
       0, ljr.`ats_score`, ljr.`career_score`, ljr.`outlook_score`, ljr.`master_score`,
       ljr.`ats_reason`, ljr.`career_reason`, ljr.`outlook_reason`,
       COALESCE(ljr.`is_unicorn`, 0), ljr.`unicorn_reason`, ljr.`status`,
       ljr.`created_at`, ljr.`created_at`, ljr.`updated_at`
FROM `linkedin_job_results` ljr
JOIN `jobs` j ON j.`source_url` = ljr.`canonical_source_url`;

-- 4. Migrate saved searches → search agents.
INSERT INTO `search_agents` (`user_id`, `name`, `criteria`, `is_active`,
                             `auto_favorite_threshold`, `last_run_at`,
                             `created_at`, `updated_at`)
SELECT `user_id`, `name`, `criteria`, `is_active`, 75, `last_run_at`,
       `created_at`, `updated_at`
FROM `linkedin_saved_searches`;

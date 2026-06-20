-- Final LinkedIn decommission: drop legacy tables (data already folded into the canonical
-- model by 0020) and generalize the app_settings column names now that they drive Search
-- Agents rather than LinkedIn-specific scraping.

-- Drop legacy per-user tables (linkedin_job_results references linkedin_saved_searches).
DROP TABLE IF EXISTS `linkedin_job_results`;--> statement-breakpoint
DROP TABLE IF EXISTS `linkedin_saved_searches`;--> statement-breakpoint

-- Generalize app_settings columns.
ALTER TABLE `app_settings` RENAME COLUMN `linkedin_search_cron_frequency` TO `search_cron_frequency`;--> statement-breakpoint
ALTER TABLE `app_settings` RENAME COLUMN `linkedin_cron_start_hour` TO `cron_start_hour`;--> statement-breakpoint
ALTER TABLE `app_settings` RENAME COLUMN `linkedin_cron_variance_minutes` TO `cron_variance_minutes`;--> statement-breakpoint
ALTER TABLE `app_settings` RENAME COLUMN `linkedin_retention_days` TO `job_retention_days`;--> statement-breakpoint
ALTER TABLE `app_settings` RENAME COLUMN `linkedin_auto_prune` TO `auto_prune`;--> statement-breakpoint
ALTER TABLE `app_settings` DROP COLUMN `linkedin_allow_all_users_view`;

--> statement-breakpoint
ALTER TABLE `app_settings` ADD `linkedin_cron_start_hour` integer DEFAULT 9 NOT NULL;
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `linkedin_cron_variance_minutes` integer DEFAULT 20 NOT NULL;

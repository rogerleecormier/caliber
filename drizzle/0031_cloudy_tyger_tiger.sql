CREATE TABLE `canonical_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_display` text NOT NULL,
	`company_norm` text NOT NULL,
	`title_display` text NOT NULL,
	`title_norm` text NOT NULL,
	`location_display` text,
	`location_norm` text,
	`remote` integer DEFAULT false,
	`employment_type` text,
	`experience_level` text,
	`department` text,
	`team` text,
	`description_plain` text,
	`description_html` text,
	`compensation_min` real,
	`compensation_max` real,
	`compensation_currency` text,
	`is_listed` integer DEFAULT true,
	`dedup_key` text NOT NULL,
	`vector_id` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_jobs_dedup_key_unique` ON `canonical_jobs` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_canonical_dedup_key` ON `canonical_jobs` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_canonical_company_title` ON `canonical_jobs` (`company_norm`,`title_norm`);--> statement-breakpoint
CREATE INDEX `idx_canonical_location` ON `canonical_jobs` (`location_norm`);--> statement-breakpoint
CREATE INDEX `idx_canonical_expires` ON `canonical_jobs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `job_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_id` text NOT NULL,
	`ats` text NOT NULL,
	`board_token` text NOT NULL,
	`source_job_id` text NOT NULL,
	`source_url` text NOT NULL,
	`apply_url` text NOT NULL,
	`raw_hash` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`canonical_id`) REFERENCES `canonical_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_ats_board_source_job` ON `job_sources` (`ats`,`board_token`,`source_job_id`);--> statement-breakpoint
CREATE INDEX `idx_sources_canonical` ON `job_sources` (`canonical_id`);--> statement-breakpoint
CREATE INDEX `idx_sources_ats_board` ON `job_sources` (`ats`,`board_token`);--> statement-breakpoint
CREATE INDEX `idx_sources_last_seen` ON `job_sources` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`ats` text NOT NULL,
	`token` text NOT NULL,
	`company_name` text,
	`crawl_frequency_tier` text DEFAULT 'tier2',
	`is_active` integer DEFAULT true,
	`last_crawled_at` text,
	`crawl_error_count` integer DEFAULT 0,
	`crawl_error_last_at` text,
	`discovered_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_ats_token` ON `boards` (`ats`,`token`);--> statement-breakpoint
CREATE INDEX `idx_boards_active` ON `boards` (`is_active`,`crawl_frequency_tier`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`ats` text,
	`board_token` text,
	`canonical_id` text,
	`source_id` text,
	`details` text,
	`actor` text DEFAULT 'system',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);
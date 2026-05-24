CREATE TABLE `discovered_companies` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text,
	`job_count` integer DEFAULT 0,
	`remote_job_count` integer DEFAULT 0,
	`departments` text,
	`suggested_category` text,
	`sample_jobs` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'new',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL DEFAULT 'user',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `master_resume` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer REFERENCES `users`(`id`),
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
	`raw_text` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `job_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer REFERENCES `users`(`id`),
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
	`applied` integer DEFAULT 0,
	`applied_at` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_analysis_id` integer REFERENCES `job_analyses`(`id`),
	`doc_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text,
	`resume_keywords` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `analytics_summary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer REFERENCES `users`(`id`),
	`period` text NOT NULL,
	`top_jd_keywords` text,
	`top_resume_keywords` text,
	`top_job_titles` text,
	`top_industries` text,
	`average_match_score` real,
	`total_analyses` integer,
	`total_resumes_generated` integer,
	`total_applied` integer DEFAULT 0,
	`updated_at` text
);

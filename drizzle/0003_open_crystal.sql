CREATE TABLE `duplicate_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id_1` integer NOT NULL,
	`job_id_2` integer NOT NULL,
	`similarity_score` integer NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id_1`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id_2`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_history` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`sources` text,
	`stats` text,
	`logs` text
);

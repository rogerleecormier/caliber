CREATE TABLE `discovery_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_processed_index` integer DEFAULT 0,
	`total_potential` integer DEFAULT 0,
	`status` text DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE `potential_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_checked_at` integer,
	`check_count` integer DEFAULT 0,
	`status` text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `potential_companies_slug_unique` ON `potential_companies` (`slug`);
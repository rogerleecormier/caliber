CREATE TABLE `greenhouse_orgs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_name` text NOT NULL UNIQUE,
	`last_scraped_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `greenhouse_orgs_org_name_unique` on `greenhouse_orgs` (`org_name`);

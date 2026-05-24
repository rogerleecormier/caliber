ALTER TABLE `linkedin_saved_searches` ADD `run_interval_hours` integer NOT NULL DEFAULT 24;
--> statement-breakpoint
ALTER TABLE `linkedin_saved_searches` ADD `sources` text NOT NULL DEFAULT '["linkedin", "greenhouse", "lever"]';

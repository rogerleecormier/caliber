ALTER TABLE `sync_history` ADD `total_companies` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sync_history` ADD `processed_companies` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sync_history` ADD `failed_companies` text DEFAULT '[]';
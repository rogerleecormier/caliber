ALTER TABLE `boards` ADD `last_discovered_at` text;--> statement-breakpoint
ALTER TABLE `boards` ADD `discovery_phase` text;--> statement-breakpoint
ALTER TABLE `boards` ADD `discovery_confidence` real;--> statement-breakpoint
ALTER TABLE `boards` ADD `validated` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `boards` ADD `validation_error_count` integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX `idx_boards_validated` ON `boards` (`validated`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_boards_confidence` ON `boards` (`discovery_confidence`);
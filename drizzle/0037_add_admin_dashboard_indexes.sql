CREATE INDEX `idx_audit_event_type_created` ON `audit_log` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_boards_discovered_at` ON `boards` (`discovered_at`);--> statement-breakpoint
CREATE INDEX `idx_boards_last_discovered_at` ON `boards` (`last_discovered_at`);--> statement-breakpoint
CREATE INDEX `idx_canonical_is_listed` ON `canonical_jobs` (`is_listed`,`expires_at`);
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_normalized_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`saved_search_id` integer,
	`canonical_job_id` text,
	`is_favorited` integer DEFAULT false NOT NULL,
	`source_origin` text NOT NULL,
	`external_reference_id` text,
	`job_title` text NOT NULL,
	`employer_name` text NOT NULL,
	`location` text,
	`industry` text,
	`source_url` text NOT NULL,
	`canonical_source_url` text NOT NULL,
	`raw_payload` text,
	`search_url` text,
	`criteria` text,
	`description` text,
	`description_pruned` text,
	`salary` text,
	`snippet` text,
	`post_date_text` text,
	`workplace_type` text,
	`remote_type` text DEFAULT 'fully_remote' NOT NULL,
	`category_id` integer,
	`ats_score` integer,
	`career_score` integer,
	`outlook_score` integer,
	`master_score` integer,
	`ats_reason` text,
	`career_reason` text,
	`outlook_reason` text,
	`is_unicorn` integer DEFAULT 0 NOT NULL,
	`unicorn_reason` text,
	`quick_analysis` text,
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
	`insights` text,
	`current_stage` text DEFAULT 'Not Started' NOT NULL,
	`final_resolution` text,
	`is_flagged` integer DEFAULT false NOT NULL,
	`discovery_timestamp` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`analyzed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`saved_search_id`) REFERENCES `search_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `canonical_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_normalized_jobs`("id", "user_id", "saved_search_id", "canonical_job_id", "is_favorited", "source_origin", "external_reference_id", "job_title", "employer_name", "location", "industry", "source_url", "canonical_source_url", "raw_payload", "search_url", "criteria", "description", "description_pruned", "salary", "snippet", "post_date_text", "workplace_type", "remote_type", "category_id", "ats_score", "career_score", "outlook_score", "master_score", "ats_reason", "career_reason", "outlook_reason", "is_unicorn", "unicorn_reason", "quick_analysis", "jd_text", "match_score", "gap_analysis", "recommendations", "pursue", "pursue_justification", "keywords", "strategy_note", "personal_interest", "career_analysis", "insights", "current_stage", "final_resolution", "is_flagged", "discovery_timestamp", "last_seen_at", "analyzed_at", "created_at", "updated_at") SELECT "id", "user_id", "saved_search_id", "canonical_job_id", "is_favorited", "source_origin", "external_reference_id", "job_title", "employer_name", "location", "industry", "source_url", "canonical_source_url", "raw_payload", "search_url", "criteria", "description", "description_pruned", "salary", "snippet", "post_date_text", "workplace_type", "remote_type", "category_id", "ats_score", "career_score", "outlook_score", "master_score", "ats_reason", "career_reason", "outlook_reason", "is_unicorn", "unicorn_reason", "quick_analysis", "jd_text", "match_score", "gap_analysis", "recommendations", "pursue", "pursue_justification", "keywords", "strategy_note", "personal_interest", "career_analysis", "insights", "current_stage", "final_resolution", "is_flagged", "discovery_timestamp", "last_seen_at", "analyzed_at", "created_at", "updated_at" FROM `normalized_jobs`;--> statement-breakpoint
DROP TABLE `normalized_jobs`;--> statement-breakpoint
ALTER TABLE `__new_normalized_jobs` RENAME TO `normalized_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- "Favorited" is no longer a pipeline stage; it becomes the default "Not Started"
-- stage, and rows that were sitting there are marked as favorited so they keep
-- showing up as starred under the new star-icon UI.
UPDATE `normalized_jobs` SET `is_favorited` = 1, `current_stage` = 'Not Started' WHERE `current_stage` = 'Favorited';
-- Epic 1: Unify global ATS catalog (`jobs`/`jobs_fts`/`duplicate_jobs`) and
-- per-user pipeline (`pipeline_jobs`/`linkedin_job_results`) into a single
-- `normalized_jobs` table with a nullable user_id (NULL = global/unowned
-- catalog row, set = discovered by that user's search agent).
-- `linkedin_saved_searches` is renamed to `search_configurations` (no shape
-- change). `search_logs` is dropped (event logging deprecated for this epic).

PRAGMA defer_foreign_keys = TRUE;
--> statement-breakpoint

-- ─── 1. New tables ──────────────────────────────────────────────────────────

ALTER TABLE `linkedin_saved_searches` RENAME TO `search_configurations`;
--> statement-breakpoint

CREATE TABLE `normalized_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text REFERENCES `user`(`id`),
	`saved_search_id` integer REFERENCES `search_configurations`(`id`),

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
	`category_id` integer REFERENCES `categories`(`id`),

	`ats_score` integer,
	`career_score` integer,
	`outlook_score` integer,
	`master_score` integer,
	`ats_reason` text,
	`career_reason` text,
	`outlook_reason` text,
	`is_unicorn` integer DEFAULT 0 NOT NULL,
	`unicorn_reason` text,

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

	`current_stage` text DEFAULT 'Discovered' NOT NULL,
	`final_resolution` text,
	`is_flagged` integer DEFAULT 0 NOT NULL,

	`discovery_timestamp` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`analyzed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `ux_normalized_jobs_source` ON `normalized_jobs` (`source_origin`, `external_reference_id`) WHERE `external_reference_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_normalized_jobs_user_url` ON `normalized_jobs` (`user_id`, `canonical_source_url`);
--> statement-breakpoint

-- ─── 2. Backfill from `jobs` (global ATS catalog, user_id = NULL) ──────────

INSERT OR IGNORE INTO `normalized_jobs` (
	user_id, saved_search_id, source_origin, external_reference_id, job_title, employer_name,
	location, industry, source_url, canonical_source_url, raw_payload,
	description, description_pruned, salary, post_date_text, workplace_type, remote_type, category_id,
	current_stage, is_flagged,
	discovery_timestamp, last_seen_at, created_at, updated_at
)
SELECT
	NULL, NULL, lower(j.source_name), NULL, j.title, COALESCE(j.company, 'Unknown'),
	NULL, NULL, j.source_url, j.source_url, NULL,
	COALESCE(j.full_description, j.description), j.description_pruned, j.pay_range,
	NULL, NULL, j.remote_type, j.category_id,
	'Discovered', 0,
	datetime(j.created_at, 'unixepoch'), datetime(j.updated_at, 'unixepoch'),
	datetime(j.created_at, 'unixepoch'), datetime(j.updated_at, 'unixepoch')
FROM `jobs` j;
--> statement-breakpoint

-- ─── 3. Backfill from `pipeline_jobs` (per-user pipeline, user_id set) ─────

INSERT OR IGNORE INTO `normalized_jobs` (
	user_id, saved_search_id, source_origin, external_reference_id, job_title, employer_name,
	location, industry, source_url, canonical_source_url, raw_payload,
	search_url, criteria, description, salary, snippet, post_date_text, workplace_type, remote_type,
	ats_score, career_score, outlook_score, master_score, ats_reason, career_reason, outlook_reason,
	is_unicorn, unicorn_reason,
	jd_text, match_score, gap_analysis, recommendations, pursue, pursue_justification,
	keywords, strategy_note, personal_interest, career_analysis, insights,
	current_stage, is_flagged,
	discovery_timestamp, last_seen_at, analyzed_at, created_at, updated_at
)
SELECT
	p.user_id, p.saved_search_id, lower(p.source_name), p.external_job_id, p.title, p.company,
	p.location, p.industry, p.source_url, p.canonical_source_url, NULL,
	p.search_url, p.criteria, p.description, p.salary, p.snippet, p.post_date_text, p.workplace_type, 'fully_remote',
	p.ats_score, p.career_score, p.outlook_score, p.master_score, p.ats_reason, p.career_reason, p.outlook_reason,
	p.is_unicorn, p.unicorn_reason,
	p.jd_text, p.match_score, p.gap_analysis, p.recommendations, p.pursue, p.pursue_justification,
	p.keywords, p.strategy_note, p.personal_interest, p.career_analysis, p.insights,
	p.status, 0,
	p.first_seen_at, p.last_seen_at, p.analyzed_at, p.created_at, p.updated_at
FROM `pipeline_jobs` p;
--> statement-breakpoint

-- ─── 4. FTS5 index ──────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE `normalized_jobs_fts` USING fts5(
	job_id UNINDEXED,
	title,
	company,
	description_pruned,
	created_at UNINDEXED,
	content=normalized_jobs,
	content_rowid=id
);
--> statement-breakpoint

INSERT INTO `normalized_jobs_fts` (rowid, job_id, title, company, description_pruned, created_at)
SELECT id, id, job_title, employer_name, description_pruned, created_at FROM `normalized_jobs`;
--> statement-breakpoint

-- ─── 5. Remap generated_documents.pipeline_job_id -> normalized_jobs.id ────
-- `generated_documents.pipeline_job_id` had a FK to `pipeline_jobs(id)`,
-- which is dropped below. Recreate the table pointing at `normalized_jobs(id)`
-- and remap existing values via the (user_id, canonical_source_url) dedup key.

CREATE TABLE `generated_documents_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_analysis_id` integer REFERENCES `job_analyses`(`id`),
	`doc_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text,
	`resume_keywords` text,
	`created_at` text,
	`pipeline_job_id` integer REFERENCES `normalized_jobs`(`id`)
);
--> statement-breakpoint

INSERT INTO `generated_documents_new` (id, job_analysis_id, doc_type, r2_key, file_name, resume_keywords, created_at, pipeline_job_id)
SELECT
	gd.id, gd.job_analysis_id, gd.doc_type, gd.r2_key, gd.file_name, gd.resume_keywords, gd.created_at,
	nj.id
FROM `generated_documents` gd
LEFT JOIN `pipeline_jobs` p ON p.id = gd.pipeline_job_id
LEFT JOIN `normalized_jobs` nj ON nj.user_id = p.user_id AND nj.canonical_source_url = p.canonical_source_url;
--> statement-breakpoint

DROP TABLE `generated_documents`;
--> statement-breakpoint

ALTER TABLE `generated_documents_new` RENAME TO `generated_documents`;
--> statement-breakpoint

-- ─── 6. Drop legacy tables ──────────────────────────────────────────────────

DROP TABLE `jobs_fts`;
--> statement-breakpoint
DROP TABLE `duplicate_jobs`;
--> statement-breakpoint
DROP TABLE `jobs`;
--> statement-breakpoint
DROP TABLE `pipeline_jobs`;
--> statement-breakpoint
DROP TABLE `linkedin_job_results`;
--> statement-breakpoint
DROP TABLE `search_logs`;

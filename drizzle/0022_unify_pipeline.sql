-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Unified Pipeline
-- Creates pipeline_jobs (merged from linkedin_job_results + job_analyses)
-- Creates search_logs (activity logging)
-- Migrates data from old tables into the new unified table
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create unified pipeline_jobs table
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id),
  saved_search_id INTEGER REFERENCES linkedin_saved_searches(id),

  -- Identity
  external_job_id      TEXT,
  title                TEXT NOT NULL,
  company              TEXT NOT NULL,
  location             TEXT,
  industry             TEXT,
  source_url           TEXT NOT NULL,
  canonical_source_url TEXT NOT NULL,
  source_name          TEXT NOT NULL DEFAULT 'LinkedIn',

  -- Discovery fields
  search_url      TEXT,
  criteria        TEXT,
  salary          TEXT,
  snippet         TEXT,
  description     TEXT,
  post_date_text  TEXT,
  workplace_type  TEXT,

  -- Agent scoring
  ats_score       INTEGER,
  career_score    INTEGER,
  outlook_score   INTEGER,
  master_score    INTEGER,
  ats_reason      TEXT,
  career_reason   TEXT,
  outlook_reason  TEXT,
  is_unicorn      INTEGER NOT NULL DEFAULT 0,
  unicorn_reason  TEXT,

  -- Deep analysis fields
  jd_text              TEXT,
  match_score          INTEGER,
  gap_analysis         TEXT,
  recommendations      TEXT,
  pursue               INTEGER,
  pursue_justification TEXT,
  keywords             TEXT,
  strategy_note        TEXT,
  personal_interest    TEXT,
  career_analysis      TEXT,
  insights             TEXT,

  -- Pipeline status
  status          TEXT NOT NULL DEFAULT 'Discovered',

  -- Timestamps
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  analyzed_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_user_id ON pipeline_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_canonical ON pipeline_jobs(user_id, canonical_source_url);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_saved_search ON pipeline_jobs(saved_search_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_last_seen ON pipeline_jobs(last_seen_at);

-- 2. Migrate linkedin_job_results → pipeline_jobs
-- Default status becomes 'Discovered' for new jobs; existing statuses carry over.
INSERT INTO pipeline_jobs (
  user_id, saved_search_id,
  external_job_id, title, company, location, industry,
  source_url, canonical_source_url, source_name,
  search_url, criteria, salary, snippet, description,
  post_date_text, workplace_type,
  ats_score, career_score, outlook_score, master_score,
  ats_reason, career_reason, outlook_reason,
  is_unicorn, unicorn_reason,
  jd_text, match_score, gap_analysis, recommendations,
  pursue, pursue_justification, keywords, strategy_note,
  personal_interest, career_analysis, insights,
  status,
  first_seen_at, last_seen_at, analyzed_at,
  created_at, updated_at
)
SELECT
  lr.user_id, lr.saved_search_id,
  lr.external_job_id, lr.title, lr.company, lr.location, NULL,
  lr.source_url, lr.canonical_source_url, lr.source_name,
  lr.search_url, lr.criteria, lr.salary, lr.snippet, lr.description,
  lr.post_date_text, lr.workplace_type,
  lr.ats_score, lr.career_score, lr.outlook_score, lr.master_score,
  lr.ats_reason, lr.career_reason, lr.outlook_reason,
  lr.is_unicorn, lr.unicorn_reason,
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  CASE
    WHEN lr.status = 'Analyzed' THEN 'Discovered'
    WHEN lr.status IN ('Prepped', 'Applied', 'Interviewed', 'Hired', 'Archived') THEN lr.status
    ELSE 'Discovered'
  END,
  lr.first_seen_at, lr.last_seen_at, NULL,
  lr.created_at, lr.updated_at
FROM linkedin_job_results lr;

-- 3. Migrate job_analyses → pipeline_jobs
-- These all get status 'Analyzed' or higher depending on applicationStatus
INSERT INTO pipeline_jobs (
  user_id, saved_search_id,
  external_job_id, title, company, location, industry,
  source_url, canonical_source_url, source_name,
  search_url, criteria, salary, snippet, description,
  post_date_text, workplace_type,
  ats_score, career_score, outlook_score, master_score,
  ats_reason, career_reason, outlook_reason,
  is_unicorn, unicorn_reason,
  jd_text, match_score, gap_analysis, recommendations,
  pursue, pursue_justification, keywords, strategy_note,
  personal_interest, career_analysis, insights,
  status,
  first_seen_at, last_seen_at, analyzed_at,
  created_at, updated_at
)
SELECT
  ja.user_id, NULL,
  NULL, COALESCE(ja.job_title, 'Untitled'), COALESCE(ja.company, 'Unknown'), ja.location, ja.industry,
  ja.job_url, ja.job_url, 'Manual',
  NULL, NULL, NULL, NULL, ja.jd_text,
  NULL, NULL,
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, NULL,
  ja.jd_text, ja.match_score, ja.gap_analysis, ja.recommendations,
  ja.pursue, ja.pursue_justification, ja.keywords, ja.strategy_note,
  ja.personal_interest, ja.career_analysis, ja.insights,
  CASE
    WHEN ja.application_status = 'Hired' THEN 'Hired'
    WHEN ja.application_status = 'Not Hired' THEN 'Not Hired'
    WHEN ja.application_status = 'Interviewed' THEN 'Interviewed'
    WHEN ja.application_status = 'Applied' OR ja.applied = 1 THEN 'Applied'
    ELSE 'Analyzed'
  END,
  COALESCE(ja.created_at, datetime('now')),
  COALESCE(ja.created_at, datetime('now')),
  ja.created_at,
  COALESCE(ja.created_at, datetime('now')),
  COALESCE(ja.created_at, datetime('now'))
FROM job_analyses ja
WHERE ja.job_url NOT IN (
  SELECT canonical_source_url FROM pipeline_jobs WHERE user_id = ja.user_id
);

-- 4. For job_analyses that DO match an existing pipeline_jobs row (by URL),
--    update the pipeline row with the analysis data
UPDATE pipeline_jobs
SET
  match_score = (SELECT ja.match_score FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  gap_analysis = (SELECT ja.gap_analysis FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  recommendations = (SELECT ja.recommendations FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  pursue = (SELECT ja.pursue FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  pursue_justification = (SELECT ja.pursue_justification FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  keywords = (SELECT ja.keywords FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  strategy_note = (SELECT ja.strategy_note FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  personal_interest = (SELECT ja.personal_interest FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  career_analysis = (SELECT ja.career_analysis FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  insights = (SELECT ja.insights FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  jd_text = (SELECT ja.jd_text FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  industry = COALESCE(pipeline_jobs.industry, (SELECT ja.industry FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1)),
  analyzed_at = (SELECT ja.created_at FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1),
  status = CASE
    WHEN (SELECT ja.application_status FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1) = 'Hired' THEN 'Hired'
    WHEN (SELECT ja.application_status FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1) = 'Not Hired' THEN 'Not Hired'
    WHEN (SELECT ja.application_status FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1) = 'Interviewed' THEN 'Interviewed'
    WHEN (SELECT ja.application_status FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1) = 'Applied' THEN 'Applied'
    WHEN (SELECT ja.applied FROM job_analyses ja WHERE ja.job_url = pipeline_jobs.canonical_source_url AND ja.user_id = pipeline_jobs.user_id LIMIT 1) = 1 THEN 'Applied'
    WHEN pipeline_jobs.status IN ('Applied', 'Interviewed', 'Hired', 'Not Hired') THEN pipeline_jobs.status
    ELSE 'Analyzed'
  END
WHERE EXISTS (
  SELECT 1 FROM job_analyses ja
  WHERE ja.job_url = pipeline_jobs.canonical_source_url
    AND ja.user_id = pipeline_jobs.user_id
);

-- 5. Create search_logs table
CREATE TABLE IF NOT EXISTS search_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id),
  saved_search_id  INTEGER REFERENCES linkedin_saved_searches(id),
  event_type       TEXT NOT NULL,
  platform         TEXT,
  agent_name       TEXT,
  message          TEXT NOT NULL,
  metadata         TEXT,
  level            TEXT NOT NULL DEFAULT 'info',
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_logs_user_id ON search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_event_type ON search_logs(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_search_logs_level ON search_logs(user_id, level);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);

-- 6. Update generated_documents to reference pipeline_jobs
-- Create a mapping column for the new FK
ALTER TABLE generated_documents ADD COLUMN pipeline_job_id INTEGER REFERENCES pipeline_jobs(id);

-- Map old job_analysis_id to pipeline_jobs.id
UPDATE generated_documents
SET pipeline_job_id = (
  SELECT pj.id FROM pipeline_jobs pj
  INNER JOIN job_analyses ja ON ja.job_url = pj.canonical_source_url AND ja.user_id = pj.user_id
  WHERE ja.id = generated_documents.job_analysis_id
  LIMIT 1
)
WHERE job_analysis_id IS NOT NULL;

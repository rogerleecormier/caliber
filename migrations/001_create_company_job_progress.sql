-- Migration: Create company_job_progress table
-- This table tracks job-level pagination progress for each company
-- to ensure we process all jobs across multiple sync runs

CREATE TABLE IF NOT EXISTS company_job_progress (
  company_slug TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  last_job_offset INTEGER DEFAULT 0,
  total_jobs_discovered INTEGER DEFAULT 0,
  last_synced_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create index on source for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_job_progress_source ON company_job_progress(source);

-- Create index on last_synced_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_company_job_progress_last_synced ON company_job_progress(last_synced_at);

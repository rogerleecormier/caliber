-- ENG-02: Job Description Pruning & Full-Text Search
-- Adds:
-- 1. description_pruned column to jobs table (for cleaned text)
-- 2. jobs_fts virtual table (FTS5 index for fast keyword search)

ALTER TABLE jobs ADD COLUMN description_pruned TEXT;

-- Create FTS5 virtual table for full-text search on job descriptions
CREATE VIRTUAL TABLE jobs_fts USING fts5(
  rowid UNINDEXED,
  job_id UNINDEXED,
  title,
  company,
  description_pruned,
  created_at UNINDEXED
);

-- Index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS jobs_fts_job_id ON jobs_fts(job_id);

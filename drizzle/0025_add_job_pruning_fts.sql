-- ENG-02: Job Description Pruning & Full-Text Search
-- Adds:
-- 1. description_pruned column to jobs table (for cleaned text)
-- 2. jobs_fts virtual table (FTS5 index for fast keyword search)

ALTER TABLE jobs ADD COLUMN description_pruned TEXT;

-- Create FTS5 virtual table for full-text search on job descriptions
CREATE VIRTUAL TABLE jobs_fts USING fts5(
  job_id UNINDEXED,
  title,
  company,
  description_pruned,
  created_at UNINDEXED,
  content=jobs,
  content_rowid=id
);

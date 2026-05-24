-- Migration: Add lazy cleansing columns to jobs table
-- descriptionRaw stores the original raw data from source
-- isCleansed tracks whether description has been sanitized

ALTER TABLE jobs ADD COLUMN description_raw TEXT;
ALTER TABLE jobs ADD COLUMN is_cleansed INTEGER DEFAULT 0;

-- Add source column to sync_history for per-source tracking
ALTER TABLE sync_history ADD COLUMN source TEXT;

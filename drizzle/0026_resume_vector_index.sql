-- Create resume_vector_index table for semantic RAG matching
-- Tracks vectorized resume chunks and their Vectorize embeddings
CREATE TABLE IF NOT EXISTS resume_vector_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  vector_id TEXT,
  content_hash TEXT NOT NULL,
  embedded_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for fast lookup by user + section
CREATE INDEX IF NOT EXISTS idx_resume_vector_user_section
  ON resume_vector_index(user_id, section_type);

-- Index for hash-based change detection
CREATE INDEX IF NOT EXISTS idx_resume_vector_hash
  ON resume_vector_index(user_id, content_hash);

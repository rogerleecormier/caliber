-- Revert: Convert milliseconds back to seconds
-- Drizzle schema uses { mode: 'timestamp' } which expects seconds in the DB.
-- We inadvertently stored milliseconds.
-- Safety check: Only touch values > 10 billion (which are definitely ms).
UPDATE jobs 
SET post_date = post_date / 1000 
WHERE post_date > 10000000000;

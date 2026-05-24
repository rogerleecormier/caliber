-- Fix Himalayas dates stored as seconds (convert to ms)
UPDATE jobs 
SET post_date = post_date * 1000 
WHERE source_name = 'Himalayas' 
  AND post_date IS NOT NULL 
  AND post_date < 10000000000; -- Less than 10 billion (approx year 2286 in seconds, or crazy small in ms)

-- Optional: Clean up stale RemoteOK jobs with NULL dates? 
-- Or set them to a default old date?
-- For now, purely fixing the recoverable Himalayas data.

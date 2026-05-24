-- Fix Greenhouse dates stored as seconds (convert to ms)
UPDATE jobs 
SET post_date = post_date * 1000 
WHERE source_name = 'Greenhouse' 
  AND post_date IS NOT NULL 
  AND post_date < 10000000000;

-- Emergency Fix: Fix dates that are way too large (likely multiplied by 1000 twice or already ms)
-- Divider is 1000.
-- We target anything > 2000000000000 (year 2033)
UPDATE jobs 
SET post_date = post_date / 1000 
WHERE post_date > 2000000000000;

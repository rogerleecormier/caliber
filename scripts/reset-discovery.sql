-- Reset companies with status 'not_found' back to 'pending' so they can be discovered again
-- This allows the discovery worker to retry these companies
UPDATE potential_companies 
SET status = 'pending', 
    check_count = 0,
    last_checked_at = NULL
WHERE status = 'not_found';

-- Show count of reset companies
SELECT COUNT(*) as companies_reset FROM potential_companies WHERE status = 'pending';

-- Align LinkedIn saved-job status values with the application pipeline used on /history.
UPDATE `linkedin_job_results`
SET `status` = 'Review'
WHERE `status` = 'Saved';

UPDATE `linkedin_job_results`
SET `status` = 'Applied'
WHERE `status` = 'Interviewing';

UPDATE `linkedin_job_results`
SET `status` = 'Archived'
WHERE `status` = 'Rejected';

-- Move LinkedIn saved-job statuses to the application pipeline vocabulary:
-- Analyzed > Prepped > Applied > Interviewed > Hired.
UPDATE `linkedin_job_results`
SET `status` = 'Analyzed'
WHERE `status` IN ('Saved', 'Review', 'Pursue');

UPDATE `linkedin_job_results`
SET `status` = 'Prepped'
WHERE `status` IN ('Docs Started', 'Ready to Apply');

UPDATE `linkedin_job_results`
SET `status` = 'Interviewed'
WHERE `status` = 'Interviewing';

UPDATE `linkedin_job_results`
SET `status` = 'Archived'
WHERE `status` = 'Rejected';

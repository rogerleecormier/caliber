-- Persist late-stage application outcomes separately from the historical boolean applied flag.
ALTER TABLE `job_analyses` ADD `application_status` text;

UPDATE `job_analyses`
SET `application_status` = 'Applied'
WHERE `applied` = 1 AND (`application_status` IS NULL OR `application_status` = '');

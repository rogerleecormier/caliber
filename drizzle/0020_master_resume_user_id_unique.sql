-- Ensure one master resume per user before adding uniqueness.
-- Keep the most recently updated row (fallback to highest id when timestamps tie/missing).
DELETE FROM master_resume
WHERE id IN (
  SELECT older.id
  FROM master_resume AS older
  JOIN master_resume AS newer
    ON older.user_id = newer.user_id
   AND older.user_id IS NOT NULL
   AND (
        COALESCE(older.updated_at, '') < COALESCE(newer.updated_at, '')
        OR (
          COALESCE(older.updated_at, '') = COALESCE(newer.updated_at, '')
          AND older.id < newer.id
        )
   )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `master_resume_user_id_unique`
ON `master_resume` (`user_id`);

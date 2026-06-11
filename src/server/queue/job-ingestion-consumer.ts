/**
 * Job Ingestion Queue Consumer
 *
 * Processes messages from the job-ingestion-queue sequentially,
 * handling ATS job upserts (Greenhouse/Lever/Workable) into the
 * unified `normalized_jobs` table (userId = null, global catalog rows).
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { determineCategoryId } from '@/lib/job-sources'
import { canonicalizeJobUrl } from '@/lib/normalized-jobs-persistence'
import { pruneJobDescription } from '@/lib/prune-job-description'
import type { JobIngestionMessage, AtsJobMessage, GreenhouseOrgMessage } from '@/lib/job-ingestion-queue'
import { processGreenhouseOrgMessage } from './greenhouse-org-consumer'

/**
 * Process a batch of job ingestion messages sequentially.
 * Each message is acked/retried individually.
 */
export async function processJobIngestionBatch(
  db: DrizzleD1Database,
  batch: MessageBatch<JobIngestionMessage>,
): Promise<void> {
  const now = new Date().toISOString()
  let successCount = 0
  let failureCount = 0

  for (const message of batch.messages) {
    try {
      if (message.body.type === 'ats_job') {
        await processAtsJobMessage(db, message.body, now)
      } else if (message.body.type === 'greenhouse_org_discovery') {
        await processGreenhouseOrgMessage(db, message.body as GreenhouseOrgMessage)
      }
      message.ack()
      successCount++
    } catch (error) {
      failureCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[job-ingestion-consumer] Failed to process ${message.body.type}:`,
        errorMsg,
      )
      message.retry()
    }
  }

  console.log(
    `[job-ingestion-consumer] Batch complete: ${successCount} ack'd, ${failureCount} retry'd`,
  )
}

/**
 * Process an ATS job message (Greenhouse/Lever/Workable).
 * Checks for existing global catalog record (userId IS NULL) by
 * canonicalSourceUrl, then upserts. Prunes description and syncs FTS5 index.
 */
async function processAtsJobMessage(
  db: DrizzleD1Database,
  message: AtsJobMessage,
  now: string,
): Promise<void> {
  const { source, company, payload } = message

  const canonicalSourceUrl = canonicalizeJobUrl(payload.sourceUrl)
  const categoryId = determineCategoryId(payload.title, payload.description, [])
  const descriptionPruned = pruneJobDescription(payload.description)

  const existing = await db
    .select()
    .from(schema.normalizedJobs)
    .where(
      and(
        sql`${schema.normalizedJobs.userId} IS NULL`,
        eq(schema.normalizedJobs.canonicalSourceUrl, canonicalSourceUrl),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    const jobId = existing[0].id
    await db
      .update(schema.normalizedJobs)
      .set({
        jobTitle: payload.title,
        employerName: company,
        description: payload.description,
        descriptionPruned,
        categoryId,
        postDateText: payload.postDate,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(schema.normalizedJobs.id, jobId))

    await updateJobFts(db, jobId, payload.title, company, descriptionPruned, now)

    console.log(
      `[job-ingestion-consumer] ATS updated: ${source}/${company} - "${payload.title}"`,
    )
  } else {
    const result = await db.insert(schema.normalizedJobs).values({
      userId: null,
      sourceOrigin: source,
      jobTitle: payload.title,
      employerName: company,
      sourceUrl: payload.sourceUrl,
      canonicalSourceUrl,
      description: payload.description,
      descriptionPruned,
      postDateText: payload.postDate,
      remoteType: 'fully_remote',
      categoryId,
      currentStage: 'Discovered',
      isFlagged: false,
      isUnicorn: 0,
      discoveryTimestamp: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const jobId = result.meta.last_row_id as number
    if (jobId) {
      await insertJobFts(db, jobId, payload.title, company, descriptionPruned, now)
    }

    console.log(
      `[job-ingestion-consumer] ATS inserted: ${source}/${company} - "${payload.title}"`,
    )
  }
}

/**
 * Insert a job into the normalized_jobs FTS5 index.
 */
async function insertJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string | null,
  descriptionPruned: string,
  createdAt: string,
): Promise<void> {
  try {
    await db.run(
      sql`
        INSERT INTO normalized_jobs_fts (rowid, job_id, title, company, description_pruned, created_at)
        VALUES (${jobId}, ${jobId}, ${title}, ${company}, ${descriptionPruned}, ${createdAt})
      `,
    )
  } catch (error) {
    console.error(
      `[job-ingestion-consumer] Failed to insert FTS5 record for job ${jobId}:`,
      error,
    )
  }
}

/**
 * Update a job in the normalized_jobs FTS5 index.
 */
async function updateJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string | null,
  descriptionPruned: string,
  createdAt: string,
): Promise<void> {
  try {
    await db.run(sql`DELETE FROM normalized_jobs_fts WHERE rowid = ${jobId}`)
    await db.run(
      sql`
        INSERT INTO normalized_jobs_fts (rowid, job_id, title, company, description_pruned, created_at)
        VALUES (${jobId}, ${jobId}, ${title}, ${company}, ${descriptionPruned}, ${createdAt})
      `,
    )
  } catch (error) {
    console.error(
      `[job-ingestion-consumer] Failed to update FTS5 record for job ${jobId}:`,
      error,
    )
  }
}

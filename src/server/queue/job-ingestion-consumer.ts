/**
 * Job Ingestion Queue Consumer
 *
 * Processes messages from the job-ingestion-queue sequentially,
 * handling both ATS job upserts (Greenhouse/Lever/Workable) and
 * LinkedIn pipeline job upserts.
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { determineCategoryId } from '@/lib/job-sources'
import { canonicalizeLinkedinJobUrl } from '@/lib/linkedin-persistence'
import { pruneJobDescription } from '@/lib/prune-job-description'
import type { JobIngestionMessage, AtsJobMessage, PipelineJobMessage, GreenhouseOrgMessage } from '@/lib/job-ingestion-queue'
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
      } else if (message.body.type === 'pipeline_job') {
        await processPipelineJobMessage(db, message.body, now)
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
 * Checks for existing record by sourceUrl, then upserts.
 * Prunes description and syncs FTS5 index (ENG-02).
 */
async function processAtsJobMessage(
  db: DrizzleD1Database,
  message: AtsJobMessage,
  _now: string,
): Promise<void> {
  const { source, company, payload } = message

  const existing = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.sourceUrl, payload.sourceUrl))
    .limit(1)

  const categoryId = determineCategoryId(payload.title, payload.description, [])
  const postDate = payload.postDate ? new Date(payload.postDate) : new Date()
  const descriptionPruned = pruneJobDescription(payload.description)

  if (existing.length > 0) {
    const jobId = existing[0].id
    await db
      .update(schema.jobs)
      .set({
        title: payload.title,
        company,
        descriptionRaw: payload.description,
        descriptionPruned,
        isCleansed: 0,
        updatedAt: new Date(),
        postDate: postDate || existing[0].postDate,
        categoryId,
      })
      .where(eq(schema.jobs.id, jobId))

    // Update FTS5 index
    await updateJobFts(db, jobId, payload.title, company, descriptionPruned)

    console.log(
      `[job-ingestion-consumer] ATS updated: ${source}/${company} - "${payload.title}"`,
    )
  } else {
    const result = await db.insert(schema.jobs).values({
      title: payload.title,
      company,
      descriptionRaw: payload.description,
      descriptionPruned,
      isCleansed: 0,
      sourceUrl: payload.sourceUrl,
      sourceName: payload.sourceName,
      postDate,
      categoryId,
      remoteType: 'fully_remote',
    })

    // Insert into FTS5 index (use the inserted rowid from the jobs table)
    const jobId = result.meta.last_row_id as number
    if (jobId) {
      await insertJobFts(db, jobId, payload.title, company, descriptionPruned)
    }

    console.log(
      `[job-ingestion-consumer] ATS inserted: ${source}/${company} - "${payload.title}"`,
    )
  }
}

/**
 * Insert a job into the FTS5 index.
 * For external content FTS5 tables, we use raw SQL for proper handling.
 */
async function insertJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string | null,
  descriptionPruned: string,
): Promise<void> {
  try {
    await db.run(
      sql`
        INSERT INTO jobs_fts (rowid, job_id, title, company, description_pruned)
        VALUES (${jobId}, ${jobId}, ${title}, ${company}, ${descriptionPruned})
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
 * Update a job in the FTS5 index.
 * For external content FTS5 tables, we use raw SQL for proper handling.
 */
async function updateJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string | null,
  descriptionPruned: string,
): Promise<void> {
  try {
    // Delete old FTS5 record by rowid
    await db.run(
      sql`
        DELETE FROM jobs_fts WHERE rowid = ${jobId}
      `,
    )

    // Insert updated FTS5 record
    await db.run(
      sql`
        INSERT INTO jobs_fts (rowid, job_id, title, company, description_pruned)
        VALUES (${jobId}, ${jobId}, ${title}, ${company}, ${descriptionPruned})
      `,
    )
  } catch (error) {
    console.error(
      `[job-ingestion-consumer] Failed to update FTS5 record for job ${jobId}:`,
      error,
    )
  }
}

/**
 * Process a pipeline job message (LinkedIn search result).
 * Checks for existing record by userId + canonicalSourceUrl, then upserts.
 */
async function processPipelineJobMessage(
  db: DrizzleD1Database,
  message: PipelineJobMessage,
  now: string,
): Promise<void> {
  const { userId, savedSearchId, searchUrl, criteria, job, shouldBackfillWorkplaceType } = message
  const canonicalSourceUrl = canonicalizeLinkedinJobUrl(job.sourceUrl, job.id)

  const existing = await db
    .select()
    .from(schema.pipelineJobs)
    .where(
      and(
        eq(schema.pipelineJobs.userId, userId),
        eq(schema.pipelineJobs.canonicalSourceUrl, canonicalSourceUrl),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    // Update if backfilling workplace type or refreshing lastSeenAt
    if (shouldBackfillWorkplaceType || existing[0].lastSeenAt !== now) {
      await db
        .update(schema.pipelineJobs)
        .set({
          workplaceType: shouldBackfillWorkplaceType ? job.workplaceType : existing[0].workplaceType,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(schema.pipelineJobs.id, existing[0].id))

      console.log(
        `[job-ingestion-consumer] Pipeline updated: "${job.title}" at ${job.company}`,
      )
    }
  } else {
    const values = {
      userId,
      savedSearchId: savedSearchId ?? null,
      externalJobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      sourceUrl: job.sourceUrl,
      canonicalSourceUrl,
      sourceName: job.sourceName,
      searchUrl,
      criteria: JSON.stringify(criteria),
      salary: job.salary ?? null,
      snippet: job.snippet ?? null,
      description: job.description ?? null,
      postDateText: job.postDateText ?? null,
      workplaceType: job.workplaceType ?? null,
      atsScore: job.score?.atsScore ?? null,
      careerScore: job.score?.careerScore ?? null,
      outlookScore: job.score?.outlookScore ?? null,
      masterScore: job.score?.masterScore ?? null,
      atsReason: job.score?.atsReason ?? null,
      careerReason: job.score?.careerReason ?? null,
      outlookReason: job.score?.outlookReason ?? null,
      isUnicorn: job.score?.isUnicorn ? 1 : 0,
      unicornReason: job.score?.unicornReason ?? null,
      status: 'Discovered' as const,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(schema.pipelineJobs).values(values)

    console.log(
      `[job-ingestion-consumer] Pipeline inserted: "${job.title}" at ${job.company}`,
    )
  }
}

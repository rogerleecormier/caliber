/**
 * Job Score Queue Consumer
 *
 * Processes job-score-queue messages sequentially. For each newly-crawled
 * canonicalJobs row, scores it against every user's master resume and
 * upserts a per-user normalizedJobs row carrying the scores — mirroring
 * the upsert pattern in src/routes/api/saved-jobs.ts, but without
 * favoriting the job.
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { scoreJobAgainstProfile } from '@/lib/ai/job-score'
import { canonicalizeJobUrl } from '@/lib/normalized-jobs-persistence'
import type { JobScoreMessage } from '@/lib/job-score-queue'

export async function processJobScoreBatch(
  db: DrizzleD1Database,
  ai: any,
  batch: MessageBatch<JobScoreMessage>,
): Promise<void> {
  let successCount = 0
  let failureCount = 0

  for (const message of batch.messages) {
    try {
      await processJobScoreMessage(db, ai, message.body)
      message.ack()
      successCount++
    } catch (error) {
      failureCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[job-score-consumer] Failed to score ${message.body.canonicalJobId}:`,
        errorMsg,
      )
      message.retry()
    }
  }

  console.log(
    `[job-score-consumer] Batch complete: ${successCount} ack'd, ${failureCount} retry'd`,
  )
}

async function processJobScoreMessage(
  db: DrizzleD1Database,
  ai: any,
  message: JobScoreMessage,
): Promise<void> {
  const { canonicalJobId } = message

  const [job] = await db
    .select()
    .from(schema.canonicalJobs)
    .where(eq(schema.canonicalJobs.id, canonicalJobId))
    .limit(1)

  if (!job) {
    console.warn(`[job-score-consumer] canonicalJobs row ${canonicalJobId} not found, skipping`)
    return
  }

  const resumeRows = await db
    .select({ userId: schema.masterResume.userId, rawText: schema.masterResume.rawText })
    .from(schema.masterResume)

  const usersWithResume = resumeRows.filter(
    (r): r is { userId: string; rawText: string } => !!r.userId && !!r.rawText,
  )

  if (usersWithResume.length === 0) {
    return
  }

  const [sourceRow] = await db
    .select({ sourceUrl: schema.jobSources.sourceUrl, ats: schema.jobSources.ats })
    .from(schema.jobSources)
    .where(eq(schema.jobSources.canonicalId, canonicalJobId))
    .limit(1)

  const sourceUrl = sourceRow?.sourceUrl || `https://caliber.internal/jobs/canonical/${canonicalJobId}`
  const sourceOrigin = sourceRow?.ats || 'unknown'
  const canonicalUrl = canonicalizeJobUrl(sourceUrl)
  const now = new Date().toISOString()

  for (const { userId, rawText } of usersWithResume) {
    try {
      const scores = await scoreJobAgainstProfile(ai, rawText, {
        id: canonicalJobId,
        title: job.titleDisplay,
        description: job.descriptionPlain || '',
      })

      const [existing] = await db
        .select({ id: schema.normalizedJobs.id })
        .from(schema.normalizedJobs)
        .where(
          and(
            eq(schema.normalizedJobs.userId, userId),
            or(
              eq(schema.normalizedJobs.canonicalJobId, canonicalJobId),
              eq(schema.normalizedJobs.canonicalSourceUrl, canonicalUrl),
            ),
          ),
        )
        .limit(1)

      if (existing) {
        await db
          .update(schema.normalizedJobs)
          .set({
            canonicalJobId,
            atsScore: scores.atsScore,
            careerScore: scores.careerScore,
            outlookScore: scores.outlookScore,
            masterScore: scores.masterScore,
            atsReason: scores.atsReason,
            careerReason: scores.careerReason,
            outlookReason: scores.outlookReason,
            isUnicorn: scores.isUnicorn ? 1 : 0,
            unicornReason: scores.unicornReason,
            quickAnalysis: scores.quickAnalysis,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(schema.normalizedJobs.id, existing.id))
      } else {
        await db.insert(schema.normalizedJobs).values({
          userId,
          canonicalJobId,
          isFavorited: false,
          sourceOrigin,
          jobTitle: job.titleDisplay,
          employerName: job.companyDisplay,
          location: job.locationDisplay || null,
          sourceUrl,
          canonicalSourceUrl: canonicalUrl,
          description: job.descriptionPlain || null,
          snippet: job.descriptionPlain ? job.descriptionPlain.substring(0, 300) : null,
          workplaceType: job.remote ? 'remote' : 'on-site',
          remoteType: job.remote ? 'fully_remote' : 'unspecified',
          currentStage: 'Not Started',
          isFlagged: false,
          isUnicorn: scores.isUnicorn ? 1 : 0,
          unicornReason: scores.unicornReason,
          quickAnalysis: scores.quickAnalysis,
          atsScore: scores.atsScore,
          careerScore: scores.careerScore,
          outlookScore: scores.outlookScore,
          masterScore: scores.masterScore,
          atsReason: scores.atsReason,
          careerReason: scores.careerReason,
          outlookReason: scores.outlookReason,
          discoveryTimestamp: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    } catch (scoreErr) {
      console.error(
        `[job-score-consumer] Scoring failed for job ${canonicalJobId}, user ${userId}:`,
        scoreErr,
      )
    }
  }
}

/**
 * Greenhouse Job Sync Cron
 *
 * Queries the greenhouse_orgs table for active organizations,
 * fetches jobs from the Greenhouse API, and upserts them into the
 * unified normalized_jobs table (userId = null, global catalog rows).
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { pruneJobDescription } from '@/lib/prune-job-description'
import { determineCategoryId } from '@/lib/job-sources'
import { canonicalizeJobUrl } from '@/lib/normalized-jobs-persistence'

interface GreenhouseJob {
  id: string
  title: string
  location?: {
    name?: string
  }
  updated_at?: string
  internal_job_id?: number
  content?: string
}

interface GreenhouseJobsApiResponse {
  jobs: GreenhouseJob[]
}

/**
 * Run Greenhouse sync: fetch jobs from all active orgs and upsert to jobs table
 */
export async function runGreenhouseSyncCron(db: DrizzleD1Database): Promise<void> {
  const startTime = new Date()
  console.log('[greenhouse-sync-cron] Starting Greenhouse job sync')

  const activeOrgs = await db
    .select()
    .from(schema.greenhouseOrgs)
    .where(eq(schema.greenhouseOrgs.status, 'active'))

  if (activeOrgs.length === 0) {
    console.log('[greenhouse-sync-cron] No active Greenhouse organizations found')
    return
  }

  console.log(`[greenhouse-sync-cron] Found ${activeOrgs.length} active organizations`)

  let totalFetched = 0
  let totalUpserted = 0
  let totalFailed = 0

  for (const org of activeOrgs) {
    try {
      const jobCount = await syncGreenhouseOrgJobs(db, org.orgName)
      totalFetched += jobCount
      totalUpserted += jobCount

      await db
        .update(schema.greenhouseOrgs)
        .set({
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.greenhouseOrgs.orgName, org.orgName))
    } catch (error) {
      totalFailed++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[greenhouse-sync-cron] Failed to sync org ${org.orgName}:`,
        errorMsg,
      )
    }
  }

  const duration = Math.round((new Date().getTime() - startTime.getTime()) / 1000)
  console.log(
    `[greenhouse-sync-cron] Completed in ${duration}s: ` +
    `${totalUpserted} upserted, ${totalFailed} failed`,
  )
}

/**
 * Fetch jobs from Greenhouse API for a specific org and upsert into normalized_jobs
 */
async function syncGreenhouseOrgJobs(
  db: DrizzleD1Database,
  orgName: string,
): Promise<number> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${orgName}/jobs`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Greenhouse API returned ${response.status} for org ${orgName}`,
    )
  }

  const data = (await response.json()) as GreenhouseJobsApiResponse

  if (!data.jobs || !Array.isArray(data.jobs)) {
    console.log(`[greenhouse-sync-cron] No jobs found for org ${orgName}`)
    return 0
  }

  let upsertCount = 0
  const now = new Date().toISOString()

  for (const ghJob of data.jobs) {
    try {
      const sourceUrl = `https://boards.greenhouse.io/${orgName}/jobs/${ghJob.id}`
      const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl)
      const categoryId = determineCategoryId(ghJob.title, ghJob.content || '', [])
      const postDateText = ghJob.updated_at ?? null
      const descriptionPruned = pruneJobDescription(ghJob.content || '')

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
            jobTitle: ghJob.title,
            employerName: orgName,
            description: ghJob.content || '',
            descriptionPruned,
            categoryId,
            postDateText,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(schema.normalizedJobs.id, jobId))

        await updateJobFts(db, jobId, ghJob.title, orgName, descriptionPruned, now)
      } else {
        const result = await db.insert(schema.normalizedJobs).values({
          userId: null,
          sourceOrigin: 'greenhouse',
          externalReferenceId: String(ghJob.id),
          jobTitle: ghJob.title,
          employerName: orgName,
          sourceUrl,
          canonicalSourceUrl,
          description: ghJob.content || '',
          descriptionPruned,
          postDateText,
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
          await insertJobFts(db, jobId, ghJob.title, orgName, descriptionPruned, now)
        }
      }

      upsertCount++
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[greenhouse-sync-cron] Failed to upsert job ${ghJob.id} from ${orgName}:`,
        errorMsg,
      )
    }
  }

  console.log(
    `[greenhouse-sync-cron] Synced ${upsertCount} jobs for org ${orgName}`,
  )
  return upsertCount
}

/**
 * Insert a job into the normalized_jobs FTS5 index
 */
async function insertJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string,
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
      `[greenhouse-sync-cron] Failed to insert FTS5 record for job ${jobId}:`,
      error,
    )
  }
}

/**
 * Update a job in the normalized_jobs FTS5 index
 */
async function updateJobFts(
  db: DrizzleD1Database,
  jobId: number,
  title: string,
  company: string,
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
      `[greenhouse-sync-cron] Failed to update FTS5 record for job ${jobId}:`,
      error,
    )
  }
}

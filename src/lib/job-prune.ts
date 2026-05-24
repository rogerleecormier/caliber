import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from '../db/db'
import { schema } from '../db/db'
import { jobSources } from './job-sources'

export interface PruneOptions {
  dryRun?: boolean
  sources?: string[]
  db:  DrizzleD1Database
  onLog?: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
}

export interface PruneResult {
  jobsToDelete: number
  jobsDeleted: number
  orphanedJobs: Array<{
    id: number
    title: string
    company: string | null
    sourceName: string
    sourceUrl: string
  }>
}

/**
 * Prune jobs that no longer exist in their source APIs
 */
export async function pruneJobs(options: PruneOptions): Promise<PruneResult> {
  const { dryRun = true, sources, db, onLog } = options
  const log = onLog || console.log

  log('🧹 Starting job pruning process...', 'info')
  log(dryRun ? '   Running in DRY RUN mode (no deletions)' : '   Running in LIVE mode (will delete jobs)', dryRun ? 'warning' : 'info')
  log('', 'info')

  const orphanedJobs: PruneResult['orphanedJobs'] = []

  // Get all jobs from DB
  const allJobs = await db.select().from(schema.jobs)
  log(`📊 Loaded ${allJobs.length} jobs from database`, 'info')

  // Filter by source if specified
  const jobsToCheck = sources && sources.length > 0
    ? allJobs.filter(job => sources.includes(job.sourceName))
    : allJobs

  log(`🔍 Checking ${jobsToCheck.length} jobs...`, 'info')
  log('', 'info')

  // Group jobs by source
  const jobsBySource = new Map<string, typeof allJobs>()
  for (const job of jobsToCheck) {
    const existing = jobsBySource.get(job.sourceName) || []
    existing.push(job)
    jobsBySource.set(job.sourceName, existing)
  }

  // Check each source
  for (const [sourceName, jobs] of jobsBySource.entries()) {
    log(`\n📡 Checking ${sourceName} (${jobs.length} jobs)...`, 'info')
    
    const source = jobSources.find(s => s.name === sourceName)
    if (!source) {
      log(`   ⚠️  Source "${sourceName}" not found in job sources`, 'warning')
      continue
    }

    // Fetch current jobs from source
    const currentJobUrls = new Set<string>()
    try {
      for await (const batch of source.fetch()) {
        batch.forEach(job => currentJobUrls.add(job.sourceUrl))
      }
      log(`   Found ${currentJobUrls.size} current jobs from ${sourceName}`, 'info')
    } catch (error) {
      log(`   ❌ Error fetching from ${sourceName}: ${error}`, 'error')
      continue
    }

    // Check which DB jobs are no longer in source
    for (const job of jobs) {
      if (!currentJobUrls.has(job.sourceUrl)) {
        orphanedJobs.push({
          id: job.id,
          title: job.title,
          company: job.company,
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl
        })
        log(`   🗑️  Orphaned: ${job.title} at ${job.company || 'Unknown'}`, 'warning')
      }
    }
  }

  log('', 'info')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
  log(`📊 Pruning Summary`, 'info')
  log(`   Orphaned jobs found: ${orphanedJobs.length}`, orphanedJobs.length > 0 ? 'warning' : 'success')

  let deleted = 0
  if (!dryRun && orphanedJobs.length > 0) {
    log('', 'info')
    log('🗑️  Deleting orphaned jobs...', 'info')
    for (const job of orphanedJobs) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id))
      deleted++
      if (deleted % 10 === 0) {
        log(`   Deleted ${deleted}/${orphanedJobs.length} jobs...`, 'info')
      }
    }
    log(`✅ Deleted ${deleted} orphaned jobs`, 'success')
  } else if (dryRun && orphanedJobs.length > 0) {
    log('', 'info')
    log(`⚠️  DRY RUN: Would delete ${orphanedJobs.length} jobs`, 'warning')
    log('   Run with dryRun: false to actually delete these jobs', 'info')
  }

  return {
    jobsToDelete: orphanedJobs.length,
    jobsDeleted: deleted,
    orphanedJobs
  }
}

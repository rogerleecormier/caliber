import { sql, and, or, ne } from 'drizzle-orm'
import type { DrizzleD1Database } from '../db/db'
import { schema } from '../db/db'

export interface DeduplicateOptions {
  dryRun?: boolean
  criteria?: ('title' | 'company' | 'salary' | 'description')[]
  db: DrizzleD1Database
  onLog?: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
}

export interface DuplicateGroup {
  jobs: Array<{
    id: number
    title: string
    company: string | null
    sourceName: string
    payRange: string | null
  }>
  similarityScore: number
  reason: string
}

export interface DeduplicateResult {
  duplicatesFound: number
  duplicatesRemoved: number
  duplicateGroups: DuplicateGroup[]
}

/**
 * Calculate similarity between two strings (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  if (s1 === s2) return 100

  // Simple Jaccard similarity using words
  const words1 = new Set(s1.split(/\s+/))
  const words2 = new Set(s2.split(/\s+/))
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return Math.round((intersection.size / union.size) * 100)
}

/**
 * Find and optionally remove duplicate jobs
 */
export async function deduplicateJobs(options: DeduplicateOptions): Promise<DeduplicateResult> {
  const { dryRun = true, criteria = ['title', 'company'], db, onLog } = options
  const log = onLog || console.log

  log('🔍 Starting deduplication process...', 'info')
  log(dryRun ? '   Running in DRY RUN mode (no deletions)' : '   Running in LIVE mode (will delete duplicates)', dryRun ? 'warning' : 'info')
  log(`   Criteria: ${criteria.join(', ')}`, 'info')
  log('', 'info')

  // Get all jobs
  const allJobs = await db.select().from(schema.jobs)
  log(`📊 Loaded ${allJobs.length} jobs from database`, 'info')

  const duplicateGroups: DuplicateGroup[] = []
  const processedIds = new Set<number>()

  // Compare each job with every other job
  for (let i = 0; i < allJobs.length; i++) {
    const job1 = allJobs[i]
    
    if (processedIds.has(job1.id)) continue

    const duplicates: typeof allJobs = [job1]

    for (let j = i + 1; j < allJobs.length; j++) {
      const job2 = allJobs[j]
      
      if (processedIds.has(job2.id)) continue

      let isDuplicate = true
      let reason = ''
      let totalScore = 0
      let scoreCount = 0

      // Check each criterion
      if (criteria.includes('title')) {
        const titleScore = calculateSimilarity(job1.title, job2.title)
        totalScore += titleScore
        scoreCount++
        if (titleScore < 80) isDuplicate = false
        else reason += `Title match (${titleScore}%), `
      }

      if (criteria.includes('company') && job1.company && job2.company) {
        const companyScore = calculateSimilarity(job1.company, job2.company)
        totalScore += companyScore
        scoreCount++
        if (companyScore < 90) isDuplicate = false
        else reason += `Company match (${companyScore}%), `
      }

      if (criteria.includes('salary') && job1.payRange && job2.payRange) {
        if (job1.payRange === job2.payRange) {
          reason += 'Exact salary match, '
          totalScore += 100
          scoreCount++
        } else {
          isDuplicate = false
        }
      }

      if (criteria.includes('description') && job1.description && job2.description) {
        const descScore = calculateSimilarity(
          job1.description.substring(0, 500), // First 500 chars
          job2.description.substring(0, 500)
        )
        totalScore += descScore
        scoreCount++
        if (descScore < 70) isDuplicate = false
        else reason += `Description match (${descScore}%), `
      }

      if (isDuplicate && scoreCount > 0) {
        const avgScore = Math.round(totalScore / scoreCount)
        duplicates.push(job2)
        processedIds.add(job2.id)
        
        // Save to duplicate tracking table
        if (!dryRun) {
          await db.insert(schema.duplicateJobs).values({
            jobId1: job1.id,
            jobId2: job2.id,
            similarityScore: avgScore,
            resolved: false
          })
        }
      }
    }

    if (duplicates.length > 1) {
      processedIds.add(job1.id)
      const avgScore = duplicates.length > 1 ? 90 : 100
      duplicateGroups.push({
        jobs: duplicates.map(j => ({
          id: j.id,
          title: j.title,
          company: j.company,
          sourceName: j.sourceName,
          payRange: j.payRange
        })),
        similarityScore: avgScore,
        reason: reason.slice(0, -2) // Remove trailing comma and space
      })

      log(`   Found duplicate group (${duplicates.length} jobs):`, 'warning')
      duplicates.forEach(j => {
        log(`      - [${j.id}] ${j.title} at ${j.company || 'Unknown'} (${j.sourceName})`, 'info')
      })
    }
  }

  log('', 'info')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
  log(`📊 Deduplication Summary`, 'info')
  log(`   Duplicate groups found: ${duplicateGroups.length}`, duplicateGroups.length > 0 ? 'warning' : 'success')
  
  const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + (group.jobs.length - 1), 0)
  log(`   Total duplicate jobs: ${totalDuplicates}`, 'info')

  let removed = 0
  if (!dryRun && duplicateGroups.length > 0) {
    log('', 'info')
    log('🗑️  Removing duplicate jobs (keeping first in each group)...', 'info')
    
    for (const group of duplicateGroups) {
      // Keep the first job (oldest), delete the rest
      const toDelete = group.jobs.slice(1)
      for (const job of toDelete) {
        await db.delete(schema.jobs).where(sql`id = ${job.id}`)
        removed++
        log(`   Deleted: ${job.title} at ${job.company || 'Unknown'}`, 'info')
      }
    }
    
    log(`✅ Removed ${removed} duplicate jobs`, 'success')
  } else if (dryRun && duplicateGroups.length > 0) {
    log('', 'info')
    log(`⚠️  DRY RUN: Would remove ${totalDuplicates} duplicate jobs`, 'warning')
    log('   Run with dryRun: false to actually remove these duplicates', 'info')
  }

  return {
    duplicatesFound: totalDuplicates,
    duplicatesRemoved: removed,
    duplicateGroups
  }
}

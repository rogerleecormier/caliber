/**
 * Job Pruning API Endpoint (Lightweight)
 * Removes jobs that haven't been updated in X days (stale jobs)
 * 
 * This uses a timestamp-based approach instead of fetching from external APIs
 * to avoid Worker resource limits.
 * 
 * Usage:
 * - POST /api/v3/jobs/prune?source=Greenhouse&days=30&dryRun=true
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getDbFromContext, schema } from '../../../../db/db'
import { sql, eq, and, lt } from 'drizzle-orm'

const DEFAULT_STALE_DAYS = 30

export const Route = createFileRoute('/api/v3/jobs/prune')({
  server: {
    handlers: {
      POST: async ({ context, request }) => {
        const startTime = Date.now()
        
        try {
          const ctx = context as any
          let db;
          
          // Try to get DB connection with explicit error handling
          try {
            db = await getDbFromContext(ctx)
          } catch (dbError) {
            const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError)
            console.error('[Job Prune] DB connection failed:', dbErrorMsg)
            return json({
              success: false,
              error: `Database connection failed: ${dbErrorMsg}`,
              duration: Date.now() - startTime
            }, { status: 500 })
          }
          
          // Parse query parameters
          const url = new URL(request.url)
          const sourceParam = url.searchParams.get('source')
          const daysParam = url.searchParams.get('days')
          const dryRunParam = url.searchParams.get('dryRun')
          
          const staleDays = daysParam ? parseInt(daysParam) : DEFAULT_STALE_DAYS
          const dryRun = dryRunParam === 'true' || dryRunParam === '1' || !dryRunParam // Default to dry run
          
          // Calculate cutoff date
          const cutoffDate = new Date()
          cutoffDate.setDate(cutoffDate.getDate() - staleDays)
          
          console.log('[Job Prune] Starting prune operation', {
            source: sourceParam || 'all',
            staleDays,
            cutoffDate: cutoffDate.toISOString(),
            dryRun,
            timestamp: new Date().toISOString()
          })
          
          // Build query conditions
          const conditions = [
            lt(schema.jobs.updatedAt, cutoffDate)
          ]
          
          if (sourceParam) {
            conditions.push(eq(schema.jobs.sourceName, sourceParam))
          }
          
          // Find stale jobs
          const staleJobs = await db.select({
            id: schema.jobs.id,
            title: schema.jobs.title,
            company: schema.jobs.company,
            sourceName: schema.jobs.sourceName,
            sourceUrl: schema.jobs.sourceUrl,
            updatedAt: schema.jobs.updatedAt
          })
          .from(schema.jobs)
          .where(and(...conditions))
          .limit(500) // Limit to prevent resource exhaustion
          
          const jobsToDelete = staleJobs.length
          let jobsDeleted = 0
          
          // Delete if not dry run
          if (!dryRun && staleJobs.length > 0) {
            const jobIds = staleJobs.map(j => j.id)
            
            // Delete in batches to avoid hitting limits
            const batchSize = 100
            for (let i = 0; i < jobIds.length; i += batchSize) {
              const batch = jobIds.slice(i, i + batchSize)
              await db.delete(schema.jobs)
                .where(sql`id IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`)
              jobsDeleted += batch.length
            }
            
            console.log('[Job Prune] Deleted', jobsDeleted, 'jobs')
          }
          
          const duration = Date.now() - startTime
          
          console.log('[Job Prune] Completed', {
            jobsToDelete,
            jobsDeleted,
            dryRun,
            duration
          })
          
          return json({
            success: true,
            dryRun,
            sources: sourceParam || 'all',
            staleDays,
            cutoffDate: cutoffDate.toISOString(),
            jobsToDelete,
            jobsDeleted,
            orphanedJobs: staleJobs.slice(0, 100).map(job => ({ // Limit response size
              id: job.id,
              title: job.title,
              company: job.company,
              source: job.sourceName,
              url: job.sourceUrl,
              lastUpdated: job.updatedAt
            })),
            logs: [
              `[info] Checking jobs not updated since ${cutoffDate.toISOString()}`,
              `[info] Found ${jobsToDelete} stale jobs`,
              dryRun 
                ? `[warning] DRY RUN - No jobs deleted`
                : `[success] Deleted ${jobsDeleted} jobs`
            ],
            duration
          })
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[Job Prune] Fatal error:', errorMsg)
          
          return json({
            success: false,
            error: errorMsg,
            duration: Date.now() - startTime
          }, { status: 500 })
        }
      }
    }
  }
})

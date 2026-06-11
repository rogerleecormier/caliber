/**
 * V3 Stats Endpoint
 * Dashboard statistics with worker status
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getDbFromContext, schema } from '../../../db/db'
import { isNull, sql } from 'drizzle-orm'

export const Route = createFileRoute('/api/v3/stats')({
  server: {
    handlers: {
      GET: async ({ context }) => {
        try {
          const ctx = context as any
          const db = await getDbFromContext(ctx)

          // Total jobs by source (global ATS catalog: userId IS NULL)
          const jobsBySource = await db.select({
            sourceName: schema.normalizedJobs.sourceOrigin,
            count: sql<number>`count(*)`
          })
          .from(schema.normalizedJobs)
          .where(isNull(schema.normalizedJobs.userId))
          .groupBy(schema.normalizedJobs.sourceOrigin)

          const sourceMap: Record<string, number> = {}
          for (const row of jobsBySource) {
            const key = (row.sourceName || 'unknown').toLowerCase()
            sourceMap[key] = Number(row.count) || 0
          }

          // Total jobs
          const totalJobsResult = await db.select({
            count: sql<number>`count(*)`
          }).from(schema.normalizedJobs).where(isNull(schema.normalizedJobs.userId))
          const totalJobs = Number(totalJobsResult[0]?.count) || 0
          
          // Company counts
          const discoveredResult = await db.select({
            count: sql<number>`count(*)`
          }).from(schema.discoveredCompanies)
          const totalDiscoveredCompanies = Number(discoveredResult[0]?.count) || 0

          const pendingResult = await db.select({
            count: sql<number>`count(*)`
          })
          .from(schema.potentialCompanies)
          .where(sql`status = 'pending' OR status IS NULL`)
          const pendingCompanies = Number(pendingResult[0]?.count) || 0

          // Per-source sync status (last successful sync)
          const sources = ['greenhouse', 'lever', 'workable'] as const
          const sourceSyncStatus: Record<string, {
            lastSync: string | null
            status: 'running' | 'completed' | 'failed' | 'never'
            jobsAdded: number
            error?: string
          }> = {}

          for (const source of sources) {
            // Get last completed sync for timestamp
            const lastCompleted = await db.select({
              completedAt: schema.syncHistory.completedAt,
              stats: schema.syncHistory.stats
            })
            .from(schema.syncHistory)
            .where(sql`source = ${source} AND status = 'completed'`)
            .orderBy(sql`completed_at DESC`)
            .limit(1)

            // Get most recent sync for status
            const lastSync = await db.select({
              status: schema.syncHistory.status,
              stats: schema.syncHistory.stats
            })
            .from(schema.syncHistory)
            .where(sql`source = ${source}`)
            .orderBy(sql`started_at DESC`)
            .limit(1)

            const stats = lastCompleted[0]?.stats as any
            const lastStatus = lastSync[0]?.status as any
            const lastError = (lastSync[0]?.stats as any)?.error

            sourceSyncStatus[source] = {
              lastSync: lastCompleted[0]?.completedAt 
                ? new Date(lastCompleted[0].completedAt).toISOString() 
                : null,
              status: lastStatus || 'never',
              jobsAdded: stats?.jobsAdded || 0,
              error: lastStatus === 'failed' ? lastError : undefined
            }
          }

          // Worker status (individual workers)
          const workerStatus = {
            ats: {
              name: 'ATS Sync',
              icon: '🏢',
              sources: ['Greenhouse', 'Lever', 'Workable'],
              schedule: 'Every 2 min (odd)',
              lastSync: getLatestSync(sourceSyncStatus.greenhouse, sourceSyncStatus.lever),
              status: getAggregatedStatus(sourceSyncStatus.greenhouse, sourceSyncStatus.lever, sourceSyncStatus.workable),
              error: sourceSyncStatus.greenhouse?.error || sourceSyncStatus.lever?.error || sourceSyncStatus.workable?.error
            },
            discovery: await getDiscoveryStatus(db)
          }

          // Last overall sync
          const lastSyncResult = await db.select({
            completedAt: schema.syncHistory.completedAt
          })
          .from(schema.syncHistory)
          .where(sql`status = 'completed' AND sync_type != 'batch_state'`)
          .orderBy(sql`completed_at DESC`)
          .limit(1)

          return json({
            success: true,
            stats: {
              totalJobs,
              totalDiscoveredCompanies,
              pendingCompanies,
              jobsBySource: {
                greenhouse: sourceMap['greenhouse'] || 0,
                lever: sourceMap['lever'] || 0,
                workable: sourceMap['workable'] || 0
              },
              lastSyncAt: lastSyncResult[0]?.completedAt 
                ? new Date(lastSyncResult[0].completedAt).toISOString() 
                : null,
              sourceSyncStatus,
              workerStatus
            }
          })

        } catch (error) {
          console.error('Stats API error:', error)
          return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 })
        }
      }
    }
  }
})

function getLatestSync(a: any, b: any): string | null {
  if (!a?.lastSync && !b?.lastSync) return null
  if (!a?.lastSync) return b.lastSync
  if (!b?.lastSync) return a.lastSync
  return new Date(a.lastSync) > new Date(b.lastSync) ? a.lastSync : b.lastSync
}

function getAggregatedStatus(a: any, b: any, c?: any): string {
  if (a?.status === 'running' || b?.status === 'running' || c?.status === 'running') return 'running'
  if (a?.status === 'failed' && b?.status === 'failed' && (!c || c?.status === 'failed')) return 'failed'
  if (a?.status === 'completed' || b?.status === 'completed' || c?.status === 'completed') return 'completed'
  return 'never'
}

async function getDiscoveryStatus(db: any) {
  const lastDiscovery = await db.select({
    completedAt: schema.syncHistory.completedAt,
    status: schema.syncHistory.status,
    stats: schema.syncHistory.stats
  })
  .from(schema.syncHistory)
  .where(sql`sync_type = 'discovery'`)
  .orderBy(sql`started_at DESC`)
  .limit(1)

  const lastCompleted = await db.select({
    completedAt: schema.syncHistory.completedAt
  })
  .from(schema.syncHistory)
  .where(sql`sync_type = 'discovery' AND status = 'completed'`)
  .orderBy(sql`completed_at DESC`)
  .limit(1)

  return {
    name: 'Discovery',
    icon: '🔍',
    sources: ['Company Discovery'],
    schedule: '*/3 min :00',
    lastSync: lastCompleted[0]?.completedAt 
      ? new Date(lastCompleted[0].completedAt).toISOString() 
      : null,
    status: lastDiscovery[0]?.status || 'never',
    error: lastDiscovery[0]?.status === 'failed' 
      ? (lastDiscovery[0]?.stats as any)?.error 
      : undefined
  }
}

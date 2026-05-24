/**
 * V3 Logs Endpoint
 * Sync logs with error details for dashboard debugging
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getDbFromContext, schema } from '../../../db/db'
import { sql } from 'drizzle-orm'

export interface SyncLogResponse {
  id: string
  syncType: string
  source: string | null
  startedAt: string | null
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  stats: {
    jobsAdded: number
    jobsUpdated: number
    jobsDeleted: number
    companiesAdded?: number
    companiesChecked?: number
    company?: string
    error?: string
  }
  logs: Array<{
    timestamp: string
    type: 'info' | 'success' | 'error' | 'warning'
    message: string
  }>
}

export const Route = createFileRoute('/api/v3/logs')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const ctx = context as any
          const db = await getDbFromContext(ctx)
          const url = new URL(request.url)
          
          // Parse query parameters
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
          const source = url.searchParams.get('source')
          const status = url.searchParams.get('status')
          const includeErrors = url.searchParams.get('errors') === 'true'

          // Build query
          let whereConditions = sql`status != 'batch_state'`
          
          if (source) {
            whereConditions = sql`${whereConditions} AND source = ${source}`
          }
          
          if (status) {
            whereConditions = sql`${whereConditions} AND status = ${status}`
          }
          
          if (includeErrors) {
            whereConditions = sql`${whereConditions} AND status = 'failed'`
          }

          const syncLogs = await db.select()
            .from(schema.syncHistory)
            .where(whereConditions)
            .orderBy(sql`started_at DESC`)
            .limit(limit)

          const logs: SyncLogResponse[] = syncLogs.map(sync => ({
            id: sync.id,
            syncType: sync.syncType || 'unknown',
            source: sync.source,
            startedAt: sync.startedAt ? new Date(sync.startedAt).toISOString() : null,
            completedAt: sync.completedAt ? new Date(sync.completedAt).toISOString() : null,
            status: sync.status as 'running' | 'completed' | 'failed',
            stats: {
              jobsAdded: (sync.stats as any)?.jobsAdded || 0,
              jobsUpdated: (sync.stats as any)?.jobsUpdated || 0,
              jobsDeleted: (sync.stats as any)?.jobsDeleted || 0,
              companiesAdded: (sync.stats as any)?.companiesAdded,
              companiesChecked: (sync.stats as any)?.companiesChecked,
              company: (sync.stats as any)?.company,
              error: (sync.stats as any)?.error
            },
            logs: Array.isArray(sync.logs) ? sync.logs as any[] : []
          }))

          // Get error summary
          const errorCount = await db.select({
            count: sql<number>`count(*)`
          })
          .from(schema.syncHistory)
          .where(sql`status = 'failed' AND started_at > ${Math.floor(Date.now() / 1000) - 3600}`)
          
          const recentErrors = Number(errorCount[0]?.count) || 0

          return json({
            success: true,
            logs,
            meta: {
              count: logs.length,
              recentErrors,
              hasMore: logs.length === limit
            }
          })

        } catch (error) {
          console.error('Logs API error:', error)
          return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 })
        }
      }
    }
  }
})

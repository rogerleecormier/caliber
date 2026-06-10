// Cloudflare Worker entry point
// Wraps TanStack Start's fetch handler and adds the cron scheduled and queue handlers.

import { aggregateAnalytics } from './src/server/cron/aggregate-analytics'
import { runLinkedinSearchMaintenance } from './src/server/cron/linkedin-searches'
import { runGreenhouseSyncCron } from './src/server/cron/greenhouse-sync'
import { processJobIngestionBatch } from './src/server/queue/job-ingestion-consumer'
import { processScrapeRequestBatch } from './src/server/queue/scrape-request-consumer'
import type { CloudflareEnv } from './src/lib/cloudflare'
import { getDb } from './src/db/db'
import type { JobIngestionMessage } from './src/lib/job-ingestion-queue'
import type { ScrapeRequestQueueMessage } from './src/lib/scrape-request-queue'

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    // Store env globally so getCloudflareEnv() can access it from server functions.
    ;(globalThis as any).__CF_ENV__ = env
    ;(globalThis as any).__CF_CTX__ = ctx

    // @ts-ignore - built artifact, not in source
    const { default: server } = await import('./dist/server/server.js')
    return server.fetch(request, env, ctx)
  },

  async scheduled(_event: ScheduledEvent, env: CloudflareEnv, _ctx: ExecutionContext) {
    const db = getDb(env.DB)
    await runLinkedinSearchMaintenance(env)
    await runGreenhouseSyncCron(db)
    if (new Date().getUTCHours() % 6 === 0) {
      await aggregateAnalytics(env)
    }
  },

  async queue(
    batch: MessageBatch<JobIngestionMessage | ScrapeRequestQueueMessage>,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ) {
    if (!env.DB) throw new Error('Database unavailable')
    const db = getDb(env.DB)

    // Route to appropriate consumer based on message type
    if (batch.messages.length > 0) {
      const firstMessage = batch.messages[0]?.body as any
      if (firstMessage?.type === 'scrape_job_content') {
        // Scrape request queue
        await processScrapeRequestBatch(
          db,
          env.JOB_INGESTION_QUEUE,
          batch as MessageBatch<ScrapeRequestQueueMessage>
        )
      } else {
        // Job ingestion queue (default)
        await processJobIngestionBatch(
          db,
          batch as MessageBatch<JobIngestionMessage>
        )
      }
    }
  },
}

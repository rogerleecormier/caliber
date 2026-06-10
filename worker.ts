// Cloudflare Worker entry point
// Wraps TanStack Start's fetch handler and adds the cron scheduled and queue handlers.

import { aggregateAnalytics } from './src/server/cron/aggregate-analytics'
import { runLinkedinSearchMaintenance } from './src/server/cron/linkedin-searches'
import { processJobIngestionBatch } from './src/server/queue/job-ingestion-consumer'
import type { CloudflareEnv } from './src/lib/cloudflare'
import { getDb } from './src/db/db'
import type { JobIngestionMessage } from './src/lib/job-ingestion-queue'

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
    await runLinkedinSearchMaintenance(env)
    if (new Date().getUTCHours() % 6 === 0) {
      await aggregateAnalytics(env)
    }
  },

  async queue(
    batch: MessageBatch<JobIngestionMessage>,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ) {
    if (!env.DB) throw new Error('Database unavailable')
    const db = getDb(env.DB)
    await processJobIngestionBatch(db, batch)
  },
}

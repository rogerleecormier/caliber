// Cloudflare Worker entry point
// Wraps TanStack Start's fetch handler and adds the cron scheduled handler.

import { aggregateAnalytics } from './src/server/cron/aggregate-analytics'
import { runSearchAgentMaintenance } from './src/server/cron/search-agents'
import { backfillJobEmbeddings } from './src/server/cron/embed-jobs'
import type { CloudflareEnv } from './src/lib/cloudflare'

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    // Store env globally so getCloudflareEnv() can access it from server functions.
    ;(globalThis as any).__CF_ENV__ = env
    ;(globalThis as any).__CF_CTX__ = ctx

    const { default: server } = await import('./dist/server/server.js')
    return server.fetch(request, env, ctx)
  },

  async scheduled(_event: ScheduledEvent, env: CloudflareEnv, _ctx: ExecutionContext) {
    // Keep the canonical index fresh, then run user search agents against it.
    await backfillJobEmbeddings(env)
    await runSearchAgentMaintenance(env)
    if (new Date().getUTCHours() % 6 === 0) {
      await aggregateAnalytics(env)
    }
  },
}

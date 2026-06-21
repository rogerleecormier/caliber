// Cloudflare Worker entry point
// Wraps TanStack Start's fetch handler and adds the cron scheduled and queue handlers.

import { aggregateAnalytics } from './src/server/cron/aggregate-analytics'
import { runAgentPoller } from './src/server/cron/agent-poller'
import { runGreenhouseSyncCron } from './src/server/cron/greenhouse-sync'
import { runBoardCrawlerCron } from './src/server/cron/board-crawler'
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
    await runAgentPoller(env)
    await runGreenhouseSyncCron(db)
    try {
      await runBoardCrawlerCron(env as any)
    } catch (e) {
      console.error('Failed to run board crawler cron:', e)
    }
    if (new Date().getUTCHours() % 6 === 0) {
      await aggregateAnalytics(env)
    }
    if (new Date().getUTCHours() % 12 === 0 && (env as any).DISCOVERY_QUEUE) {
      try {
        const discoveryPhases = [
          { phase: 'company_lists', priority: 1 },
          { phase: 'llm_inference', priority: 2 },
          { phase: 'aggregators', priority: 3 },
          { phase: 'search_engine', priority: 4 },
          { phase: 'job_feeds', priority: 5 }
        ];
        for (const item of discoveryPhases) {
          await (env as any).DISCOVERY_QUEUE.send({ phase: item.phase, priority: item.priority });
        }
        console.log('[scheduled-cron] Successfully enqueued discovery phases');
      } catch (e) {
        console.error('[scheduled-cron] Failed to enqueue discovery phases:', e);
      }
    }
  },

  async queue(
    batch: MessageBatch<any>,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ) {
    if (!env.DB) throw new Error('Database unavailable')
    
    // Route to appropriate consumer based on queue name or message type
    if (batch.messages.length > 0) {
      const queueName = (batch as any).queue;
      if (queueName === 'crawl-jobs') {
        const { processCrawlJobsQueue } = await import('./src/server/rate-limit/queue-handler')
        await processCrawlJobsQueue(batch as any, env)
        return
      }
      
      if (queueName === 'discovery-queue') {
        const { processDiscoveryQueue } = await import('./src/server/discovery/consumer')
        await processDiscoveryQueue(batch, env)
        return
      }

      if (queueName === 'crawl-cron-queue') {
        const message = batch.messages[0]?.body as any
        try {
          await runBoardCrawlerCron(env as any, message?.forceAll || false)
          batch.ackAll()
        } catch (e) {
          console.error('[crawl-cron-queue] Error:', e)
          batch.retryAll()
        }
        return
      }

      const db = getDb(env.DB)
      const firstMessage = batch.messages[0]?.body as any
      if (firstMessage?.type === 'scrape_job_content') {
        // Scrape request queue
        await processScrapeRequestBatch(
          db,
          env.JOB_INGESTION_QUEUE as any,
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

export { RateLimiter } from './src/server/rate-limit/durable-object'


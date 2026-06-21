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
    const now = new Date()
    const hour = now.getUTCHours()
    // minuteOfDay in 30-min resolution: 0, 30, 60, 90, ... 1410
    const minuteOfDay = hour * 60 + (now.getUTCMinutes() >= 30 ? 30 : 0)

    // Every tick: agent poller + board crawler
    await runAgentPoller(env)
    await runGreenhouseSyncCron(db)
    try {
      await runBoardCrawlerCron(env as any)
    } catch (e) {
      console.error('[ticker] board-crawler failed:', e)
    }

    const dq = (env as any).DISCOVERY_QUEUE
    if (!dq) {
      console.warn('[ticker] DISCOVERY_QUEUE not bound, skipping discovery dispatch')
      return
    }

    const enqueue = async (phase: string) => {
      try {
        await dq.send({ phase })
      } catch (e) {
        console.error(`[ticker] Failed to enqueue ${phase}:`, e)
      }
    }

    // Every tick (30 min): drain potentialCompanies → boards
    await enqueue('slug_probe')

    // Every 2 hrs (minuteOfDay % 120 === 0): seed potentialCompanies + aggregators
    if (minuteOfDay % 120 === 0) {
      await enqueue('company_lists')
      await enqueue('aggregators')
    }

    // Every 6 hrs: job feeds + analytics rollup
    if (minuteOfDay % 360 === 0) {
      await enqueue('job_feeds')
      try { await aggregateAnalytics(env) } catch (e) { console.error('[ticker] analytics failed:', e) }
    }

    // Every 12 hrs: search engine dorks (rate-limited / paid API)
    if (minuteOfDay % 720 === 0) {
      await enqueue('search_engine')
    }

    // Once a day at 02:00 UTC: LLM inference (Workers AI, most expensive)
    if (hour === 2 && now.getUTCMinutes() < 30) {
      await enqueue('llm_inference')
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


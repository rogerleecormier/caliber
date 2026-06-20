import { logAudit } from '../db/queries';

export interface CloudflareEnv {
  DB: D1Database;
  CRAWL_JOBS_QUEUE?: {
    send(message: any): Promise<void>;
  };
  [key: string]: any;
}

export async function runBoardCrawlerCron(
  env: CloudflareEnv,
  forceAll = false
): Promise<{ enqueuedCount: number }> {
  if (!env.DB) {
    throw new Error('D1 Database binding "DB" is not available');
  }
  if (!env.CRAWL_JOBS_QUEUE) {
    throw new Error('Queue binding "CRAWL_JOBS_QUEUE" is not available');
  }

  // Determine current UTC hour
  const utcHour = new Date().getUTCHours();
  
  // Read active boards
  const { results: boards } = await env.DB.prepare(
    'SELECT id, ats, token, company_name, crawl_frequency_tier FROM boards WHERE is_active = 1'
  ).all<{ id: string; ats: string; token: string; company_name: string | null; crawl_frequency_tier: string }>();

  if (!boards || boards.length === 0) {
    console.log('[board-crawler-cron] No active boards found in the database');
    return { enqueuedCount: 0 };
  }

  let enqueuedCount = 0;

  for (const board of boards) {
    let shouldCrawl = forceAll;

    if (!shouldCrawl) {
      const tier = board.crawl_frequency_tier;
      if (tier === 'tier1') {
        // Hourly
        shouldCrawl = true;
      } else if (tier === 'tier2') {
        // Every 6 hours
        shouldCrawl = utcHour % 6 === 0;
      } else if (tier === 'tier3') {
        // Every 24 hours (once a day at UTC 00:00)
        shouldCrawl = utcHour === 0;
      } else {
        // Default to tier2
        shouldCrawl = utcHour % 6 === 0;
      }
    }

    if (shouldCrawl) {
      const crawlUuid = crypto.randomUUID();
      console.log(`[board-crawler-cron] Enqueueing board: ${board.ats}/${board.token} (tier: ${board.crawl_frequency_tier}, uuid: ${crawlUuid})`);
      
      await env.CRAWL_JOBS_QUEUE.send({
        ats: board.ats,
        token: board.token,
        boardId: board.id,
        companyName: board.company_name ?? undefined,
        crawlUuid,
      });

      enqueuedCount++;
    }
  }

  console.log(`[board-crawler-cron] Successfully enqueued ${enqueuedCount} board crawler jobs`);
  return { enqueuedCount };
}

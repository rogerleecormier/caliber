import { logAudit } from '../db/queries';
import { seedAggregatorBoards } from './seed-aggregator-boards';

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

  await seedAggregatorBoards(env);

  // Determine current UTC hour
  const utcHour = new Date().getUTCHours();
  
  // Read active boards
  const { results: boards } = await env.DB.prepare(
    'SELECT id, ats, token, company_name, crawl_frequency_tier, last_crawled_at FROM boards WHERE is_active = 1'
  ).all<{ id: string; ats: string; token: string; company_name: string | null; crawl_frequency_tier: string; last_crawled_at: string | null }>();

  if (!boards || boards.length === 0) {
    console.log('[board-crawler-cron] No active boards found in the database');
    return { enqueuedCount: 0 };
  }

  let enqueuedCount = 0;

  for (const board of boards) {
    let shouldCrawl = forceAll;

    if (!shouldCrawl) {
      const lastCrawled = board.last_crawled_at ? new Date(board.last_crawled_at).getTime() : 0;
      const ageMs = Date.now() - lastCrawled;
      const tier = board.crawl_frequency_tier;

      let intervalMs = 6 * 60 * 60 * 1000; // Default tier2 (6 hours)
      if (tier === 'tier1') {
        intervalMs = 60 * 60 * 1000; // 1 hour
      } else if (tier === 'tier3') {
        intervalMs = 24 * 60 * 60 * 1000; // 24 hours
      }

      shouldCrawl = ageMs >= intervalMs;
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

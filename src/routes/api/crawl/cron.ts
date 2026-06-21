import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { runBoardCrawlerCron } from '@/server/cron/board-crawler';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';
import type { ExecutionContext } from 'cloudflare:workers';

async function handleCronTrigger(request: Request) {
  try {
    const url = new URL(request.url);
    const forceAll = url.searchParams.get('force') === 'true';
    const ctx = (globalThis as any).__CF_CTX__ as ExecutionContext | undefined;

    // Return response immediately, then schedule work in background
    const response = json({
      success: true,
      message: 'Crawler cron scheduled',
      forceAll
    });

    // Schedule the actual work to run in background without blocking the response
    const backgroundWork = async () => {
      try {
        const env = await getCloudflareEnvAsync();
        if (env.CRAWL_CRON_QUEUE) {
          await env.CRAWL_CRON_QUEUE.send({ forceAll });
          console.log('[cron-trigger-api] Successfully enqueued crawler cron job');
        } else {
          console.warn('[cron-trigger-api] CRAWL_CRON_QUEUE not available');
        }
      } catch (err: any) {
        console.error('[cron-trigger-api] Failed to enqueue cron job:', err);
      }
    };

    // Tell Cloudflare to run this in the background
    if (ctx?.waitUntil) {
      ctx.waitUntil(backgroundWork());
    } else {
      // Fallback: at least don't block the response
      backgroundWork().catch(err => console.error('[cron-trigger-api] Background work failed:', err));
    }

    return response;
  } catch (error) {
    console.error('[cron-trigger-api] Error triggering crawler cron:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/crawl/cron')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handleCronTrigger(request);
      },
      POST: async ({ request }) => {
        return handleCronTrigger(request);
      }
    }
  }
});

import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { runBoardCrawlerCron } from '@/server/cron/board-crawler';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';
import type { ExecutionContext } from 'cloudflare:workers';

async function handleCronTrigger(request: Request) {
  try {
    const url = new URL(request.url);
    const forceAll = url.searchParams.get('force') === 'true';

    const env = await getCloudflareEnvAsync();
    const ctx = (globalThis as any).__CF_CTX__ as ExecutionContext | undefined;

    // Enqueue the cron work and use waitUntil to run it in the background
    if (env.CRAWL_CRON_QUEUE) {
      const queuePromise = env.CRAWL_CRON_QUEUE.send({ forceAll }).catch((err: any) => {
        console.error('[cron-trigger-api] Failed to enqueue cron job:', err);
      });

      // Tell Cloudflare to wait for this promise in the background after returning the response
      if (ctx?.waitUntil) {
        ctx.waitUntil(queuePromise);
      }
    }

    return json({
      success: true,
      message: 'Crawler cron scheduled',
      forceAll
    });
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

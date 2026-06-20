import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { runBoardCrawlerCron } from '@/server/cron/board-crawler';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

async function handleCronTrigger(request: Request) {
  try {
    const url = new URL(request.url);
    const forceAll = url.searchParams.get('force') === 'true';

    const env = await getCloudflareEnvAsync();
    const result = await runBoardCrawlerCron(env as any, forceAll);

    return json({
      success: true,
      message: `Enqueued ${result.enqueuedCount} crawler jobs`,
      enqueuedCount: result.enqueuedCount,
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

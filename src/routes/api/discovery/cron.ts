import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/discovery/cron')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handleDiscoveryCron(request);
      },
      POST: async ({ request }) => {
        return handleDiscoveryCron(request);
      }
    }
  }
});

async function handleDiscoveryCron(request: Request) {
  try {
    const url = new URL(request.url);
    const bypassAuth = url.searchParams.get('bypass') === 'true';
    const isCronHeader = request.headers.get('cf-cron') === 'true';

    // Verify CF-Cron or bypass query param
    if (!isCronHeader && !bypassAuth) {
      return json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const env = await getCloudflareEnvAsync();
    if (!env.DISCOVERY_QUEUE) {
      return json({ success: false, error: 'DISCOVERY_QUEUE not configured' }, { status: 500 });
    }

    const discoveryPhases = [
      { phase: 'company_lists', priority: 1 },
      { phase: 'llm_inference', priority: 2 },
      { phase: 'aggregators', priority: 3 },
      { phase: 'search_engine', priority: 4 },
      { phase: 'job_feeds', priority: 5 }
    ];

    const enqueued = [];
    for (const item of discoveryPhases) {
      await env.DISCOVERY_QUEUE.send({
        phase: item.phase,
        priority: item.priority
      });
      enqueued.push(item.phase);
    }

    return json({
      success: true,
      message: `Enqueued ${enqueued.length} discovery phases`,
      phases: enqueued,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[api/discovery/cron] Error running discovery cron:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

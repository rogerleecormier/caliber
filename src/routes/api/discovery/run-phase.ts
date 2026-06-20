import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';
import { handleDiscoveryMessage } from '@/server/discovery/consumer';

export const Route = createFileRoute('/api/discovery/run-phase')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const phase = url.searchParams.get('phase');
          const direct = url.searchParams.get('direct') !== 'false'; // default to direct execution

          if (!phase) {
            return json({ success: false, error: 'Missing phase parameter' }, { status: 400 });
          }

          const validPhases = ['company_lists', 'llm_inference', 'aggregators', 'search_engine', 'job_feeds'];
          if (!validPhases.includes(phase)) {
            return json({ success: false, error: `Invalid phase: must be one of ${validPhases.join(', ')}` }, { status: 400 });
          }

          const env = await getCloudflareEnvAsync();

          if (direct) {
            console.log(`[api/discovery/run-phase] Running phase ${phase} directly`);
            await handleDiscoveryMessage({ phase, priority: 1 }, env);
            return json({
              success: true,
              message: `Executed phase ${phase} directly`,
              phase
            });
          } else {
            if (!env.DISCOVERY_QUEUE) {
              return json({ success: false, error: 'DISCOVERY_QUEUE binding not configured' }, { status: 500 });
            }
            console.log(`[api/discovery/run-phase] Enqueuing phase ${phase}`);
            await env.DISCOVERY_QUEUE.send({ phase, priority: 1 });
            return json({
              success: true,
              message: `Enqueued phase ${phase} to discovery-queue`,
              phase
            });
          }
        } catch (error) {
          console.error('[api/discovery/run-phase] Error triggering discovery phase:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});

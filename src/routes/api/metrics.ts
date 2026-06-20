import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/metrics')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database binding "DB" is not available' }, { status: 500 });
          }

          const stats = await env.DB.prepare(`
            SELECT
              (SELECT COUNT(*) FROM canonical_jobs) as canonical_count,
              (SELECT COUNT(*) FROM job_sources) as source_count,
              (SELECT COUNT(*) FROM boards WHERE is_active = 1) as active_boards,
              (SELECT MAX(last_crawled_at) FROM boards) as last_crawl_at,
              (SELECT COUNT(*) FROM audit_log WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
              (SELECT COUNT(*) FROM audit_log WHERE event_type = 'llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h
          `).first() as Record<string, any>;

          if (!stats) {
            return json({ success: false, error: 'Failed to query metrics from D1' }, { status: 500 });
          }

          // Gemma 4 26B costs roughly $0.011 per 1,000 active neurons/tokens in Workers AI
          const llmCalls = Number(stats.llm_calls_24h || 0);
          const estimatedCost = (llmCalls * 0.011 / 10).toFixed(4); // approx estimate

          return json({
            success: true,
            canonical_jobs: stats.canonical_count || 0,
            sources: stats.source_count || 0,
            boards_active: stats.active_boards || 0,
            last_crawl_at: stats.last_crawl_at || null,
            errors_last_24h: stats.errors_24h || 0,
            llm_calls_last_24h: llmCalls,
            estimated_cost_last_24h: `$${estimatedCost}`,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[metrics-api] Error fetching crawler metrics:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});

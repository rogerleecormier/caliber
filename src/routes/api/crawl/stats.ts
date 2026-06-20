import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/crawl/stats')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const env = await getCloudflareEnvAsync();
          const db = env.DB;
          if (!db) {
            return json({ success: false, error: 'Database unavailable' }, { status: 500 });
          }

          const { results: boards } = await db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all<any>();
          const { results: jobs } = await db.prepare('SELECT * FROM canonical_jobs ORDER BY last_seen_at DESC LIMIT 15').all<any>();
          const { results: auditLogs } = await db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20').all<any>();
          
          const stats = await db.prepare(`
            SELECT
              (SELECT COUNT(*) FROM canonical_jobs) as canonical_count,
              (SELECT COUNT(*) FROM job_sources) as source_count,
              (SELECT COUNT(*) FROM boards WHERE is_active = 1) as active_boards,
              (SELECT COUNT(*) FROM audit_log WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
              (SELECT COUNT(*) FROM audit_log WHERE event_type = 'llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h
          `).first() as any;

          // Fetch sources for the jobs
          let jobsWithSources = jobs || [];
          if (jobsWithSources.length > 0) {
            const jobIds = jobsWithSources.map(j => j.id);
            const placeholders = jobIds.map(() => '?').join(',');
            const { results: sources } = await db.prepare(`
              SELECT * FROM job_sources WHERE canonical_id IN (${placeholders})
            `).bind(...jobIds).all<any>();

            for (const job of jobsWithSources) {
              job.sources = (sources || []).filter(s => s.canonical_id === job.id);
            }
          }

          return json({
            success: true,
            boards: boards || [],
            jobs: jobsWithSources,
            auditLogs: auditLogs || [],
            stats: stats || { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 }
          });
        } catch (e) {
          console.error('[crawler-stats-api] Error loading data:', e);
          return json({
            success: false,
            error: e instanceof Error ? e.message : String(e)
          }, { status: 500 });
        }
      }
    }
  }
});

import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/jobs/crawler-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = url.searchParams.get('q') || '';
          const location = url.searchParams.get('location') || '';
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
          const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database binding "DB" is not available' }, { status: 500 });
          }

          // Build query parts
          let query = `
            SELECT id, company_display, company_norm, title_display, title_norm,
                   location_display, location_norm, remote, employment_type,
                   experience_level, department, team, description_plain,
                   compensation_min, compensation_max, compensation_currency,
                   first_seen_at, last_seen_at, expires_at, created_at, updated_at
            FROM canonical_jobs
            WHERE is_listed = 1
          `;
          
          const params: any[] = [];
          if (q) {
            query += ` AND (title_norm LIKE ? OR company_norm LIKE ? OR description_plain LIKE ?)`;
            const keyword = `%${q.toLowerCase()}%`;
            params.push(keyword, keyword, keyword);
          }

          if (location) {
            query += ` AND location_norm LIKE ?`;
            params.push(`%${location.toLowerCase()}%`);
          }

          // Total count query
          const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
          const countResult = await env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();
          const total = countResult?.total || 0;

          // Add pagination
          query += ` ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`;
          params.push(limit, offset);

          const { results: jobs } = await env.DB.prepare(query).bind(...params).all<any>();

          // Fetch sources for these jobs
          if (jobs && jobs.length > 0) {
            const jobIds = jobs.map(j => j.id);
            const placeholders = jobIds.map(() => '?').join(',');
            
            const { results: sources } = await env.DB.prepare(`
              SELECT id, canonical_id, ats, board_token, source_job_id, source_url, apply_url, first_seen_at, last_seen_at
              FROM job_sources
              WHERE canonical_id IN (${placeholders})
            `).bind(...jobIds).all<any>();

            // Map sources to their canonical jobs
            for (const job of jobs) {
              job.sources = sources.filter(s => s.canonical_id === job.id);
            }
          }

          return json({
            success: true,
            total,
            limit,
            offset,
            jobs: jobs || []
          });
        } catch (error) {
          console.error('[crawler-search-api] Error searching crawler jobs:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});

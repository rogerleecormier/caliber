import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/discovery/stats')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database unavailable' }, { status: 500 });
          }

          // Total boards metrics
          const overallStats = await env.DB.prepare(`
            SELECT
              COUNT(id) as total_boards,
              SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated_boards,
              SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_boards,
              SUM(CASE WHEN datetime(discovered_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as discovered_last_week
            FROM boards
          `).first<{
            total_boards: number;
            validated_boards: number;
            active_boards: number;
            discovered_last_week: number;
          }>();

          // Group by discovery phase
          const phaseStats = await env.DB.prepare(`
            SELECT
              COALESCE(discovery_phase, 'manual') as phase,
              COUNT(id) as count,
              ROUND(AVG(discovery_confidence), 2) as avg_confidence
            FROM boards
            GROUP BY discovery_phase
          `).all<{
            phase: string;
            count: number;
            avg_confidence: number | null;
          }>();

          // False positive metrics (validation failures / total validated in past week)
          const failureStats = await env.DB.prepare(`
            SELECT
              SUM(CASE WHEN validation_error_count > 0 THEN 1 ELSE 0 END) as validation_failures,
              COUNT(id) as total_count
            FROM boards
            WHERE datetime(discovered_at) > datetime('now', '-7 days')
          `).first<{
            validation_failures: number;
            total_count: number;
          }>();

          const totalCount = failureStats?.total_count ?? 1;
          const validationFailures = failureStats?.validation_failures ?? 0;
          const falsePositiveRate = totalCount > 0 ? (validationFailures / totalCount) : 0;

          // Fetch discovered boards
          const { results: boards } = await env.DB.prepare(`
            SELECT * FROM boards 
            WHERE last_discovered_at IS NOT NULL OR discovery_phase IS NOT NULL OR validated = 1
            ORDER BY last_discovered_at DESC, discovered_at DESC 
            LIMIT 100
          `).all<any>();

          // Fetch recent audit logs
          const recentAudit = await env.DB.prepare(`
            SELECT id, event_type, ats, board_token, details, actor, created_at
            FROM audit_log
            WHERE event_type IN ('board_discovered', 'board_validation_failed')
            ORDER BY created_at DESC
            LIMIT 30
          `).all<{
            id: string;
            event_type: string;
            ats: string | null;
            board_token: string | null;
            details: string;
            actor: string;
            created_at: string;
          }>();

          return json({
            success: true,
            total_boards: overallStats?.total_boards ?? 0,
            validated_boards: overallStats?.validated_boards ?? 0,
            active_boards: overallStats?.active_boards ?? 0,
            discovered_last_week: overallStats?.discovered_last_week ?? 0,
            by_phase: phaseStats.results ?? [],
            false_positive_rate: Number(falsePositiveRate.toFixed(4)),
            boards: boards || [],
            recent_audit: recentAudit.results.map(row => ({
              ...row,
              details: row.details ? JSON.parse(row.details) : {}
            })),
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[api/discovery/stats] Error loading discovery stats:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});

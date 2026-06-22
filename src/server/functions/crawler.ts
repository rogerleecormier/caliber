'use server';

import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getCrawlerStats = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number; offset?: number; boardOffset?: number; logOffset?: number } | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);

    const { limit = 15, offset = 0, boardOffset = 0, logOffset = 0 } = ctx.data || {};
    const BOARD_PAGE_SIZE = 15;
    const LOG_PAGE_SIZE = 25;
    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    if (!db) {
      return {
        boards: [],
        totalBoards: 0,
        jobs: [],
        totalJobs: 0,
        auditLogs: [],
        totalAuditLogs: 0,
        stats: {
          canonical_count: 0,
          source_count: 0,
          active_boards: 0,
          errors_24h: 0,
          llm_calls_24h: 0
        }
      };
    }

    const { results: boards } = await db.prepare(`
      SELECT * FROM boards ORDER BY COALESCE(last_crawled_at, created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(BOARD_PAGE_SIZE, boardOffset).all<any>();

    const totalBoardsRes = await db.prepare('SELECT COUNT(*) as total FROM boards').first<{ total: number }>();
    const totalBoards = totalBoardsRes?.total || 0;

    const { results: jobs } = await db.prepare(`
      SELECT c.* FROM canonical_jobs c
      WHERE c.is_listed = 1
      AND c.id IN (SELECT DISTINCT canonical_id FROM job_sources)
      AND NOT EXISTS (
        SELECT 1 FROM normalized_jobs n
        WHERE n.canonical_job_id = c.id
        AND n.current_stage = 'Archived'
      )
      ORDER BY c.last_seen_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all<any>();

    const totalJobsRes = await db.prepare(`
      SELECT COUNT(*) as total FROM canonical_jobs c
      WHERE c.is_listed = 1
      AND c.id IN (SELECT DISTINCT canonical_id FROM job_sources)
      AND NOT EXISTS (
        SELECT 1 FROM normalized_jobs n
        WHERE n.canonical_job_id = c.id
        AND n.current_stage = 'Archived'
      )
    `).first<{ total: number }>();
    const totalJobs = totalJobsRes?.total || 0;

    const { results: auditLogs } = await db.prepare(`
      SELECT * FROM audit_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(LOG_PAGE_SIZE, logOffset).all<any>();

    const totalAuditLogsRes = await db.prepare('SELECT COUNT(*) as total FROM audit_log').first<{ total: number }>();
    const totalAuditLogs = totalAuditLogsRes?.total || 0;

    const stats = await db.prepare(`
      SELECT
        (
          SELECT COUNT(*) FROM canonical_jobs c
          WHERE c.is_listed = 1
          AND c.id IN (SELECT DISTINCT canonical_id FROM job_sources)
          AND NOT EXISTS (
            SELECT 1 FROM normalized_jobs n
            WHERE n.canonical_job_id = c.id
            AND n.current_stage = 'Archived'
          )
        ) as canonical_count,
        (SELECT COUNT(*) FROM job_sources) as source_count,
        (SELECT COUNT(*) FROM boards WHERE is_active = 1) as active_boards,
        (SELECT COUNT(*) FROM audit_log WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
        (SELECT COUNT(*) FROM audit_log WHERE event_type = 'llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h
    `).first() as any;

    // Fetch sources and job-specific audit logs
    let jobsWithSources = jobs || [];
    if (jobsWithSources.length > 0) {
      const jobIds = jobsWithSources.map(j => j.id);
      const placeholders = jobIds.map(() => '?').join(',');

      const { results: sources } = await db.prepare(`
        SELECT * FROM job_sources WHERE canonical_id IN (${placeholders})
      `).bind(...jobIds).all<any>();

      const { results: jobLogs } = await db.prepare(`
        SELECT * FROM audit_log WHERE canonical_id IN (${placeholders}) ORDER BY created_at DESC
      `).bind(...jobIds).all<any>();

      for (const job of jobsWithSources) {
        job.sources = (sources || []).filter(s => s.canonical_id === job.id);
        job.auditLogs = (jobLogs || []).filter(l => l.canonical_id === job.id);
      }
    }

    return {
      boards: boards || [],
      totalBoards,
      jobs: jobsWithSources,
      totalJobs,
      auditLogs: auditLogs || [],
      totalAuditLogs,
      stats: stats || { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 }
    };
  });

'use server';

import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export interface AgentsAdminOverview {
  // Discovery
  totalBoards: number;
  validatedBoards: number;
  discoveredLastWeek: number;
  falsePositiveRate: number;
  // Crawler / catalog
  canonicalJobs: number;
  sourceCount: number;
  activeBoards: number;
  crawls24h: number;
  llmCalls24h: number;
  errors24h: number;
  // Job lifecycle (from Agent Insights)
  totalJobs: number;
  activeJobs: number;
  expiredJobs: number;
  crawlerJobs: number;
  manualJobs: number;
  // Source health breakdowns
  jobsByAts: Record<string, number>;
  boardsByAts: Record<string, number>;
  crawlsByAts: Record<string, number>;
  errorsByAts: Record<string, number>;
}

const EMPTY_OVERVIEW: AgentsAdminOverview = {
  totalBoards: 0, validatedBoards: 0, discoveredLastWeek: 0, falsePositiveRate: 0,
  canonicalJobs: 0, sourceCount: 0, activeBoards: 0, crawls24h: 0, llmCalls24h: 0, errors24h: 0,
  totalJobs: 0, activeJobs: 0, expiredJobs: 0, crawlerJobs: 0, manualJobs: 0,
  jobsByAts: {}, boardsByAts: {}, crawlsByAts: {}, errorsByAts: {},
};

export const getAgentsAdminOverview = createServerFn({ method: "GET" })
  .inputValidator((d: Record<string, never> | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);

    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    if (!db) return EMPTY_OVERVIEW;

    const [
      discoveryStats,
      failureStats,
      crawlerStats,
      lifecycleStats,
      jobsByAtsRows,
      boardsByAtsRows,
      crawlsByAtsRows,
      errorsByAtsRows,
    ] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(id) as total_boards,
          SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated_boards,
          SUM(CASE WHEN datetime(discovered_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as discovered_last_week
        FROM boards
      `).first<any>(),

      db.prepare(`
        SELECT
          SUM(CASE WHEN validation_error_count > 0 THEN 1 ELSE 0 END) as validation_failures,
          COUNT(id) as total_count
        FROM boards
        WHERE discovered_at > datetime('now', '-7 days')
      `).first<any>(),

      db.prepare(`
        SELECT
          (
            SELECT COUNT(*) FROM canonical_jobs c
            WHERE c.is_listed = 1
            AND NOT EXISTS (
              SELECT 1 FROM normalized_jobs n
              WHERE n.canonical_job_id = c.id AND n.current_stage = 'Archived'
            )
          ) as canonical_count,
          (SELECT COUNT(*) FROM job_sources) as source_count,
          (SELECT COUNT(*) FROM boards WHERE is_active = 1) as active_boards,
          (SELECT COUNT(*) FROM audit_log WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
          (SELECT COUNT(*) FROM audit_log WHERE event_type = 'llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h,
          (SELECT COUNT(*) FROM audit_log WHERE event_type = 'crawl_complete' AND created_at > datetime('now', '-24 hours')) as crawls_24h
      `).first<any>(),

      db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM canonical_jobs WHERE is_listed = 1) as total_jobs,
          (SELECT COUNT(*) FROM canonical_jobs WHERE is_listed = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))) as active_jobs,
          (SELECT COUNT(*) FROM canonical_jobs WHERE is_listed = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')) as expired_jobs,
          (SELECT COUNT(DISTINCT canonical_id) FROM job_sources) as crawler_jobs,
          (SELECT COUNT(*) FROM canonical_jobs WHERE is_listed = 1 AND id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)) as manual_jobs
      `).first<any>(),

      db.prepare(`
        SELECT js.ats, COUNT(DISTINCT js.canonical_id) as cnt
        FROM job_sources js
        JOIN canonical_jobs c ON c.id = js.canonical_id
        WHERE c.is_listed = 1
        GROUP BY js.ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(*) as cnt FROM boards WHERE is_active = 1 GROUP BY ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(*) as cnt FROM audit_log
        WHERE event_type = 'crawl_complete' AND created_at > datetime('now', '-24 hours')
        GROUP BY ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(*) as cnt FROM audit_log
        WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')
        GROUP BY ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),
    ]);

    const totalCount = failureStats?.total_count ?? 0;
    const validationFailures = failureStats?.validation_failures ?? 0;
    const falsePositiveRate = totalCount > 0 ? (validationFailures / totalCount) : 0;

    const jobsByAts: Record<string, number> = {};
    for (const r of jobsByAtsRows.results || []) jobsByAts[r.ats] = r.cnt;
    const boardsByAts: Record<string, number> = {};
    for (const r of boardsByAtsRows.results || []) boardsByAts[r.ats] = r.cnt;
    const crawlsByAts: Record<string, number> = {};
    for (const r of crawlsByAtsRows.results || []) crawlsByAts[r.ats] = r.cnt;
    const errorsByAts: Record<string, number> = {};
    for (const r of errorsByAtsRows.results || []) errorsByAts[r.ats] = r.cnt;

    return {
      totalBoards: discoveryStats?.total_boards ?? 0,
      validatedBoards: discoveryStats?.validated_boards ?? 0,
      discoveredLastWeek: discoveryStats?.discovered_last_week ?? 0,
      falsePositiveRate: Number(falsePositiveRate.toFixed(4)),
      canonicalJobs: crawlerStats?.canonical_count ?? 0,
      sourceCount: crawlerStats?.source_count ?? 0,
      activeBoards: crawlerStats?.active_boards ?? 0,
      crawls24h: crawlerStats?.crawls_24h ?? 0,
      llmCalls24h: crawlerStats?.llm_calls_24h ?? 0,
      errors24h: crawlerStats?.errors_24h ?? 0,
      totalJobs: lifecycleStats?.total_jobs ?? 0,
      activeJobs: lifecycleStats?.active_jobs ?? 0,
      expiredJobs: lifecycleStats?.expired_jobs ?? 0,
      crawlerJobs: lifecycleStats?.crawler_jobs ?? 0,
      manualJobs: lifecycleStats?.manual_jobs ?? 0,
      jobsByAts,
      boardsByAts,
      crawlsByAts,
      errorsByAts,
    } satisfies AgentsAdminOverview;
  });

export interface DiscoveryLogRow {
  id: string;
  createdAt: string;
  eventType: string;
  ats: string | null;
  boardToken: string | null;
  actor: string;
  details: Record<string, any>;
  success: boolean;
}

export const getDiscoveryLogs = createServerFn({ method: "GET" })
  .inputValidator((d: { search?: string; ats?: string; status?: 'all' | 'success' | 'failed'; page?: number; pageSize?: number } | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    const { search, ats, status = 'all', page = 1, pageSize = 25 } = ctx.data || {};
    const offset = (page - 1) * pageSize;

    if (!db) return { logs: [] as DiscoveryLogRow[], total: 0 };

    const whereClauses = [`event_type IN ('board_discovered', 'board_validation_failed')`];
    const params: any[] = [];

    if (status === 'success') whereClauses.push(`event_type = 'board_discovered'`);
    if (status === 'failed') whereClauses.push(`event_type = 'board_validation_failed'`);
    if (ats && ats !== 'all') { whereClauses.push(`ats = ?`); params.push(ats); }
    if (search) {
      whereClauses.push(`(board_token LIKE ? OR ats LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = whereClauses.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE ${where}`).bind(...params).first<{ cnt: number }>(),
      db.prepare(`
        SELECT * FROM audit_log WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...params, pageSize, offset).all<any>(),
    ]);

    const logs: DiscoveryLogRow[] = (dataRes.results || []).map((row: any) => {
      let details: Record<string, any> = {};
      try { details = row.details ? JSON.parse(row.details) : {}; } catch {}
      return {
        id: row.id,
        createdAt: row.created_at,
        eventType: row.event_type,
        ats: row.ats,
        boardToken: row.board_token,
        actor: row.actor,
        details,
        success: row.event_type === 'board_discovered',
      };
    });

    return { logs, total: countRes?.cnt || 0 };
  });

export interface CrawlerLogRow {
  id: string;
  createdAt: string;
  eventType: string;
  ats: string | null;
  boardToken: string | null;
  canonicalId: string | null;
  details: string;
}

export const getCrawlerLogs = createServerFn({ method: "GET" })
  .inputValidator((d: { search?: string; ats?: string; eventType?: string; page?: number; pageSize?: number } | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    const { search, ats, eventType, page = 1, pageSize = 25 } = ctx.data || {};
    const offset = (page - 1) * pageSize;

    if (!db) return { logs: [] as CrawlerLogRow[], total: 0 };

    const whereClauses = [`event_type NOT IN ('board_discovered', 'board_validation_failed')`];
    const params: any[] = [];

    if (ats && ats !== 'all') { whereClauses.push(`ats = ?`); params.push(ats); }
    if (eventType && eventType !== 'all') { whereClauses.push(`event_type = ?`); params.push(eventType); }
    if (search) {
      whereClauses.push(`(board_token LIKE ? OR ats LIKE ? OR details LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = whereClauses.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE ${where}`).bind(...params).first<{ cnt: number }>(),
      db.prepare(`
        SELECT * FROM audit_log WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...params, pageSize, offset).all<any>(),
    ]);

    const logs: CrawlerLogRow[] = (dataRes.results || []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      eventType: row.event_type,
      ats: row.ats,
      boardToken: row.board_token,
      canonicalId: row.canonical_id,
      details: row.details,
    }));

    return { logs, total: countRes?.cnt || 0 };
  });

export interface DiscoveryBoardRow {
  id: string;
  ats: string;
  token: string;
  companyName: string | null;
  discoveryConfidence: number | null;
  discoveryPhase: string | null;
  validated: boolean;
  validationErrorCount: number;
  isActive: boolean;
}

export const getDiscoveryBoards = createServerFn({ method: "GET" })
  .inputValidator((d: { search?: string; ats?: string; status?: 'all' | 'validated' | 'unvalidated'; page?: number; pageSize?: number } | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    const { search, ats, status = 'all', page = 1, pageSize = 10 } = ctx.data || {};
    const offset = (page - 1) * pageSize;

    if (!db) return { boards: [] as DiscoveryBoardRow[], total: 0 };

    const whereClauses = [`(last_discovered_at IS NOT NULL OR discovery_phase IS NOT NULL OR validated = 1)`];
    const params: any[] = [];

    if (ats && ats !== 'all') { whereClauses.push(`ats = ?`); params.push(ats); }
    if (status === 'validated') whereClauses.push(`validated = 1`);
    if (status === 'unvalidated') whereClauses.push(`validated = 0`);
    if (search) {
      whereClauses.push(`(token LIKE ? OR company_name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = whereClauses.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM boards WHERE ${where}`).bind(...params).first<{ cnt: number }>(),
      db.prepare(`
        SELECT * FROM boards WHERE ${where}
        ORDER BY last_discovered_at DESC, discovered_at DESC
        LIMIT ? OFFSET ?
      `).bind(...params, pageSize, offset).all<any>(),
    ]);

    const boards: DiscoveryBoardRow[] = (dataRes.results || []).map((row: any) => ({
      id: row.id,
      ats: row.ats,
      token: row.token,
      companyName: row.company_name,
      discoveryConfidence: row.discovery_confidence,
      discoveryPhase: row.discovery_phase,
      validated: row.validated === 1,
      validationErrorCount: row.validation_error_count || 0,
      isActive: row.is_active === 1,
    }));

    return { boards, total: countRes?.cnt || 0 };
  });

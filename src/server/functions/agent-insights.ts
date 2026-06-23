'use server';

import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export type FilterKey = 'total' | 'active' | 'expired' | 'crawler' | 'manual' | 'boards';

export interface AgentInsightsData {
  // Tier 1 — catalog-level, no user data
  totalJobs: number;       // canonical_jobs WHERE is_listed=1
  activeJobs: number;      // canonical_jobs WHERE is_listed=1 AND not expired
  expiredJobs: number;     // canonical_jobs WHERE is_listed=1 AND expires_at < now()
  crawlerJobs: number;     // canonical_jobs WITH at least one job_sources row
  manualJobs: number;      // canonical_jobs WITHOUT any job_sources row
  activeBoards: number;    // boards WHERE is_active=1

  // Tier 2 breakdowns
  crawlerByAts: Record<string, number>;   // job_sources GROUP BY ats
  boardsByAts: Record<string, number>;    // boards GROUP BY ats (active only)
  jobsByAts: Record<string, number>;      // canonical jobs per ATS via job_sources
}

export interface JobDetailRow {
  // From canonical_jobs
  id: string;
  companyDisplay: string;
  titleDisplay: string;
  locationDisplay: string | null;
  remote: boolean;
  employmentType: string | null;
  experienceLevel: string | null;
  department: string | null;
  team: string | null;
  descriptionPlain: string | null;
  dedupKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  isExpired: boolean;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  // All job_sources for this canonical job
  allSources: Array<{
    ats: string;
    boardToken: string;
    sourceJobId: string;
    sourceUrl: string;
    applyUrl: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  // Primary source (first / most recent)
  ats: string | null;
  boardToken: string | null;
  sourceJobId: string | null;
  sourceUrl: string | null;
  applyUrl: string | null;
  sourceCount: number;
}

export const getAgentInsights = createServerFn({ method: "GET" })
  .inputValidator((d: Record<string, never> | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);

    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    if (!db) {
      return {
        totalJobs: 0, activeJobs: 0, expiredJobs: 0, crawlerJobs: 0,
        manualJobs: 0, activeBoards: 0,
        crawlerByAts: {}, boardsByAts: {}, jobsByAts: {},
      } satisfies AgentInsightsData;
    }

    const [
      totalRes,
      activeRes,
      expiredRes,
      crawlerRes,
      manualRes,
      activeBoardsRes,
      crawlerByAtsRows,
      boardsByAtsRows,
      jobsByAtsRows,
    ] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM canonical_jobs WHERE is_listed = 1`).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs
        WHERE is_listed = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs
        WHERE is_listed = 1
        AND expires_at IS NOT NULL
        AND expires_at <= datetime('now')
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(DISTINCT canonical_id) as cnt FROM job_sources
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs
        WHERE is_listed = 1
        AND id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)
      `).first<{ cnt: number }>(),

      db.prepare(`SELECT COUNT(*) as cnt FROM boards WHERE is_active = 1`).first<{ cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(*) as cnt FROM job_sources GROUP BY ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(*) as cnt FROM boards WHERE is_active = 1 GROUP BY ats ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT js.ats, COUNT(DISTINCT js.canonical_id) as cnt
        FROM job_sources js
        JOIN canonical_jobs c ON c.id = js.canonical_id
        WHERE c.is_listed = 1
        GROUP BY js.ats
        ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),
    ]);

    const crawlerByAts: Record<string, number> = {};
    for (const row of crawlerByAtsRows.results || []) crawlerByAts[row.ats] = row.cnt;

    const boardsByAts: Record<string, number> = {};
    for (const row of boardsByAtsRows.results || []) boardsByAts[row.ats] = row.cnt;

    const jobsByAts: Record<string, number> = {};
    for (const row of jobsByAtsRows.results || []) jobsByAts[row.ats] = row.cnt;

    return {
      totalJobs: totalRes?.cnt || 0,
      activeJobs: activeRes?.cnt || 0,
      expiredJobs: expiredRes?.cnt || 0,
      crawlerJobs: crawlerRes?.cnt || 0,
      manualJobs: manualRes?.cnt || 0,
      activeBoards: activeBoardsRes?.cnt || 0,
      crawlerByAts,
      boardsByAts,
      jobsByAts,
    } satisfies AgentInsightsData;
  });

export const getAgentInsightsJobs = createServerFn({ method: "GET" })
  .inputValidator((d: { filter: FilterKey; subFilter?: string | null; page?: number; pageSize?: number } | undefined) => d || { filter: 'total' as FilterKey })
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);

    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    const { filter, subFilter, page = 1, pageSize = 25 } = ctx.data || { filter: 'total' as FilterKey };
    const offset = (page - 1) * pageSize;

    if (!db) return { jobs: [] as JobDetailRow[], total: 0 };

    // 'boards' filter shows board records, not canonical jobs — handled separately
    if (filter === 'boards') {
      const subFilterClause = subFilter ? `AND ats = ?` : '';
      const countParams = subFilter ? [subFilter] : [];
      const dataParams = subFilter ? [subFilter, pageSize, offset] : [pageSize, offset];

      const [countRes, dataRes] = await Promise.all([
        db.prepare(`SELECT COUNT(*) as cnt FROM boards WHERE is_active = 1 ${subFilterClause}`)
          .bind(...countParams).first<{ cnt: number }>(),
        db.prepare(`
          SELECT id, ats, token, company_name, crawl_frequency_tier, is_active,
                 last_crawled_at, crawl_error_count, discovered_at, discovery_confidence, validated
          FROM boards
          WHERE is_active = 1 ${subFilterClause}
          ORDER BY COALESCE(last_crawled_at, discovered_at) DESC
          LIMIT ? OFFSET ?
        `).bind(...dataParams).all<any>(),
      ]);

      // Return boards as a special payload — the UI handles it differently
      return {
        jobs: [] as JobDetailRow[],
        total: countRes?.cnt || 0,
        boards: dataRes.results || [],
      };
    }

    // All other filters query canonical_jobs (+ job_sources via a secondary fetch)
    let whereClauses: string[] = ['c.is_listed = 1'];
    const params: any[] = [];
    const countParams: any[] = [];

    if (filter === 'active') {
      whereClauses.push(`(c.expires_at IS NULL OR c.expires_at > datetime('now'))`);
    } else if (filter === 'expired') {
      whereClauses.push(`c.expires_at IS NOT NULL`);
      whereClauses.push(`c.expires_at <= datetime('now')`);
    } else if (filter === 'crawler') {
      whereClauses.push(`c.id IN (SELECT DISTINCT canonical_id FROM job_sources${subFilter ? ` WHERE ats = ?` : ''})`);
      if (subFilter) { countParams.push(subFilter); params.push(subFilter); }
    } else if (filter === 'manual') {
      whereClauses.push(`c.id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)`);
    }
    // filter === 'total': no extra clauses

    // For total/active/expired, allow ATS sub-filter via job_sources
    if ((filter === 'total' || filter === 'active' || filter === 'expired') && subFilter) {
      whereClauses.push(`c.id IN (SELECT DISTINCT canonical_id FROM job_sources WHERE ats = ?)`);
      countParams.push(subFilter);
      params.push(subFilter);
    }

    const where = whereClauses.join(' AND ');

    const countSql = `SELECT COUNT(*) as cnt FROM canonical_jobs c WHERE ${where}`;
    const dataSql = `
      SELECT c.id, c.company_display, c.title_display, c.location_display, c.remote,
             c.employment_type, c.experience_level, c.department, c.team,
             c.description_plain, c.dedup_key, c.first_seen_at, c.last_seen_at,
             c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
             (SELECT COUNT(*) FROM job_sources js WHERE js.canonical_id = c.id) as source_count,
             (SELECT js2.ats FROM job_sources js2 WHERE js2.canonical_id = c.id ORDER BY js2.last_seen_at DESC LIMIT 1) as primary_ats,
             (SELECT js2.board_token FROM job_sources js2 WHERE js2.canonical_id = c.id ORDER BY js2.last_seen_at DESC LIMIT 1) as primary_board_token,
             (SELECT js2.source_job_id FROM job_sources js2 WHERE js2.canonical_id = c.id ORDER BY js2.last_seen_at DESC LIMIT 1) as primary_source_job_id,
             (SELECT js2.source_url FROM job_sources js2 WHERE js2.canonical_id = c.id ORDER BY js2.last_seen_at DESC LIMIT 1) as primary_source_url,
             (SELECT js2.apply_url FROM job_sources js2 WHERE js2.canonical_id = c.id ORDER BY js2.last_seen_at DESC LIMIT 1) as primary_apply_url
      FROM canonical_jobs c
      WHERE ${where}
      ORDER BY c.last_seen_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countRes, dataRes] = await Promise.all([
      db.prepare(countSql).bind(...countParams).first<{ cnt: number }>(),
      db.prepare(dataSql).bind(...params, pageSize, offset).all<any>(),
    ]);

    const rawJobs = dataRes.results || [];
    const total = countRes?.cnt || 0;

    // Fetch all sources for this page's jobs
    let allSourcesMap: Record<string, JobDetailRow['allSources']> = {};
    if (rawJobs.length > 0) {
      const ids = rawJobs.map((j: any) => j.id);
      const placeholders = ids.map(() => '?').join(',');
      const { results: sourcesRows } = await db.prepare(`
        SELECT canonical_id, ats, board_token, source_job_id, source_url, apply_url, first_seen_at, last_seen_at
        FROM job_sources
        WHERE canonical_id IN (${placeholders})
        ORDER BY last_seen_at DESC
      `).bind(...ids).all<any>();

      for (const s of sourcesRows || []) {
        if (!allSourcesMap[s.canonical_id]) allSourcesMap[s.canonical_id] = [];
        allSourcesMap[s.canonical_id].push({
          ats: s.ats,
          boardToken: s.board_token,
          sourceJobId: s.source_job_id,
          sourceUrl: s.source_url,
          applyUrl: s.apply_url,
          firstSeenAt: s.first_seen_at,
          lastSeenAt: s.last_seen_at,
        });
      }
    }

    const now = new Date();
    const jobs: JobDetailRow[] = rawJobs.map((r: any) => ({
      id: r.id,
      companyDisplay: r.company_display || '',
      titleDisplay: r.title_display || '',
      locationDisplay: r.location_display || null,
      remote: r.remote === 1,
      employmentType: r.employment_type || null,
      experienceLevel: r.experience_level || null,
      department: r.department || null,
      team: r.team || null,
      descriptionPlain: r.description_plain || null,
      dedupKey: r.dedup_key || '',
      firstSeenAt: r.first_seen_at || '',
      lastSeenAt: r.last_seen_at || '',
      expiresAt: r.expires_at || null,
      isExpired: r.expires_at ? new Date(r.expires_at) <= now : false,
      compensationMin: r.compensation_min ?? null,
      compensationMax: r.compensation_max ?? null,
      compensationCurrency: r.compensation_currency || null,
      allSources: allSourcesMap[r.id] || [],
      ats: r.primary_ats || null,
      boardToken: r.primary_board_token || null,
      sourceJobId: r.primary_source_job_id || null,
      sourceUrl: r.primary_source_url || null,
      applyUrl: r.primary_apply_url || null,
      sourceCount: r.source_count || 0,
    }));

    return { jobs, total, boards: undefined };
  });

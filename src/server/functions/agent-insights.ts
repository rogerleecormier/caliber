'use server';

import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export type FilterKey = 'total' | 'active' | 'archived' | 'crawler' | 'manual' | 'agent-found';

export interface AgentInsightsData {
  totalJobs: number;
  activeJobs: number;
  archivedCount: number;
  crawlerJobs: number;
  manualJobs: number;
  agentFoundJobs: number;
  crawlerByAts: Record<string, number>;
  agentBySource: Record<string, number>;
  statusBreakdown: Record<string, number>;
  archivedBySource: Record<string, number>;
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
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  // From job_sources (first match)
  ats: string | null;
  boardToken: string | null;
  sourceJobId: string | null;
  sourceUrl: string | null;
  applyUrl: string | null;
  // All sources for this canonical job
  allSources: Array<{ ats: string; boardToken: string; sourceJobId: string; sourceUrl: string; applyUrl: string }>;
  // From normalized_jobs (if exists)
  normalizedId: number | null;
  sourceOrigin: string | null;
  currentStage: string | null;
  isFavorited: boolean;
  isUnicorn: boolean;
  isFlagged: boolean;
  atsScore: number | null;
  careerScore: number | null;
  outlookScore: number | null;
  masterScore: number | null;
  matchScore: number | null;
  keywords: string | null;
  analyzedAt: string | null;
  quickAnalysis: string | null;
  gapAnalysis: string | null;
  unicornReason: string | null;
  workplaceType: string | null;
  jobTitle: string | null;
  employerName: string | null;
}

export const getAgentInsights = createServerFn({ method: "GET" })
  .inputValidator((d: Record<string, never> | undefined) => d || {})
  .handler(async (ctx: any) => {
    await requireAdmin(ctx);

    const env = await getCloudflareEnvAsync();
    const db = env.DB;
    if (!db) {
      return {
        totalJobs: 0, activeJobs: 0, archivedCount: 0, crawlerJobs: 0,
        manualJobs: 0, agentFoundJobs: 0, crawlerByAts: {}, agentBySource: {},
        statusBreakdown: {}, archivedBySource: {},
      } satisfies AgentInsightsData;
    }

    const [
      totalRes,
      activeRes,
      archivedRes,
      crawlerRes,
      manualRes,
      agentFoundRes,
      crawlerByAtsRows,
      agentBySourceRows,
      statusRows,
      archivedBySourceRows,
    ] = await Promise.all([
      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs c
        WHERE c.is_listed = 1
        AND NOT EXISTS (
          SELECT 1 FROM normalized_jobs n
          WHERE n.canonical_job_id = c.id AND n.current_stage = 'Archived'
        )
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs c
        WHERE c.is_listed = 1
        AND (c.expires_at IS NULL OR c.expires_at > datetime('now'))
        AND NOT EXISTS (
          SELECT 1 FROM normalized_jobs n
          WHERE n.canonical_job_id = c.id AND n.current_stage = 'Archived'
        )
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM normalized_jobs WHERE current_stage = 'Archived'
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(DISTINCT canonical_id) as cnt FROM job_sources
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM canonical_jobs c
        WHERE c.is_listed = 1
        AND c.id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)
        AND NOT EXISTS (
          SELECT 1 FROM normalized_jobs n
          WHERE n.canonical_job_id = c.id AND n.current_stage = 'Archived'
        )
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT COUNT(*) as cnt FROM normalized_jobs
        WHERE source_origin IN ('adzuna', 'jooble', 'remotive')
      `).first<{ cnt: number }>(),

      db.prepare(`
        SELECT ats, COUNT(DISTINCT canonical_id) as cnt
        FROM job_sources
        GROUP BY ats
        ORDER BY cnt DESC
      `).all<{ ats: string; cnt: number }>(),

      db.prepare(`
        SELECT source_origin, COUNT(*) as cnt
        FROM normalized_jobs
        WHERE source_origin IN ('adzuna', 'jooble', 'remotive')
        GROUP BY source_origin
        ORDER BY cnt DESC
      `).all<{ source_origin: string; cnt: number }>(),

      db.prepare(`
        SELECT current_stage, COUNT(*) as cnt
        FROM normalized_jobs
        GROUP BY current_stage
        ORDER BY cnt DESC
      `).all<{ current_stage: string; cnt: number }>(),

      db.prepare(`
        SELECT source_origin, COUNT(*) as cnt
        FROM normalized_jobs
        WHERE current_stage = 'Archived'
        GROUP BY source_origin
        ORDER BY cnt DESC
      `).all<{ source_origin: string; cnt: number }>(),
    ]);

    const crawlerByAts: Record<string, number> = {};
    for (const row of crawlerByAtsRows.results || []) {
      crawlerByAts[row.ats] = row.cnt;
    }

    const agentBySource: Record<string, number> = {};
    for (const row of agentBySourceRows.results || []) {
      agentBySource[row.source_origin] = row.cnt;
    }

    const statusBreakdown: Record<string, number> = {};
    for (const row of statusRows.results || []) {
      if (row.current_stage) statusBreakdown[row.current_stage] = row.cnt;
    }

    const archivedBySource: Record<string, number> = {};
    for (const row of archivedBySourceRows.results || []) {
      if (row.source_origin) archivedBySource[row.source_origin] = row.cnt;
    }

    return {
      totalJobs: totalRes?.cnt || 0,
      activeJobs: activeRes?.cnt || 0,
      archivedCount: archivedRes?.cnt || 0,
      crawlerJobs: crawlerRes?.cnt || 0,
      manualJobs: manualRes?.cnt || 0,
      agentFoundJobs: agentFoundRes?.cnt || 0,
      crawlerByAts,
      agentBySource,
      statusBreakdown,
      archivedBySource,
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

    // Build the base query depending on filter
    // We always try to pull canonical + one job_source + one normalized_job record
    let countSql = '';
    let dataSql = '';
    const params: any[] = [];
    const countParams: any[] = [];

    if (filter === 'total' || filter === 'active') {
      const activeClause = filter === 'active'
        ? `AND (c.expires_at IS NULL OR c.expires_at > datetime('now'))`
        : '';
      const subFilterClause = subFilter ? `AND js.ats = ?` : '';

      countSql = `
        SELECT COUNT(DISTINCT c.id) as cnt
        FROM canonical_jobs c
        LEFT JOIN job_sources js ON js.canonical_id = c.id
        LEFT JOIN normalized_jobs n ON n.canonical_job_id = c.id
        WHERE c.is_listed = 1
        ${activeClause}
        AND (n.current_stage IS NULL OR n.current_stage != 'Archived')
        ${subFilterClause}
      `;
      dataSql = `
        SELECT
          c.id, c.company_display, c.title_display, c.location_display, c.remote,
          c.employment_type, c.experience_level, c.department, c.team,
          c.description_plain, c.dedup_key, c.first_seen_at, c.last_seen_at,
          c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
          js.ats, js.board_token, js.source_job_id, js.source_url, js.apply_url,
          n.id as normalized_id, n.source_origin, n.current_stage, n.is_favorited,
          n.is_unicorn, n.is_flagged, n.ats_score, n.career_score, n.outlook_score,
          n.master_score, n.match_score, n.keywords, n.analyzed_at,
          n.quick_analysis, n.gap_analysis, n.unicorn_reason, n.workplace_type,
          n.job_title, n.employer_name
        FROM canonical_jobs c
        LEFT JOIN job_sources js ON js.canonical_id = c.id
        LEFT JOIN normalized_jobs n ON n.canonical_job_id = c.id
        WHERE c.is_listed = 1
        ${activeClause}
        AND (n.current_stage IS NULL OR n.current_stage != 'Archived')
        ${subFilterClause}
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC
        LIMIT ? OFFSET ?
      `;
      if (subFilter) {
        countParams.push(subFilter);
        params.push(subFilter);
      }
      params.push(pageSize, offset);
    } else if (filter === 'crawler') {
      const subFilterClause = subFilter ? `AND js.ats = ?` : '';

      countSql = `
        SELECT COUNT(DISTINCT c.id) as cnt
        FROM canonical_jobs c
        INNER JOIN job_sources js ON js.canonical_id = c.id
        WHERE c.is_listed = 1
        ${subFilterClause}
      `;
      dataSql = `
        SELECT
          c.id, c.company_display, c.title_display, c.location_display, c.remote,
          c.employment_type, c.experience_level, c.department, c.team,
          c.description_plain, c.dedup_key, c.first_seen_at, c.last_seen_at,
          c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
          js.ats, js.board_token, js.source_job_id, js.source_url, js.apply_url,
          n.id as normalized_id, n.source_origin, n.current_stage, n.is_favorited,
          n.is_unicorn, n.is_flagged, n.ats_score, n.career_score, n.outlook_score,
          n.master_score, n.match_score, n.keywords, n.analyzed_at,
          n.quick_analysis, n.gap_analysis, n.unicorn_reason, n.workplace_type,
          n.job_title, n.employer_name
        FROM canonical_jobs c
        INNER JOIN job_sources js ON js.canonical_id = c.id
        LEFT JOIN normalized_jobs n ON n.canonical_job_id = c.id
        WHERE c.is_listed = 1
        ${subFilterClause}
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC
        LIMIT ? OFFSET ?
      `;
      if (subFilter) {
        countParams.push(subFilter);
        params.push(subFilter);
      }
      params.push(pageSize, offset);
    } else if (filter === 'manual') {
      const subFilterClause = subFilter ? `AND n.current_stage = ?` : '';

      countSql = `
        SELECT COUNT(*) as cnt
        FROM canonical_jobs c
        LEFT JOIN normalized_jobs n ON n.canonical_job_id = c.id
        WHERE c.is_listed = 1
        AND c.id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)
        ${subFilterClause}
      `;
      dataSql = `
        SELECT
          c.id, c.company_display, c.title_display, c.location_display, c.remote,
          c.employment_type, c.experience_level, c.department, c.team,
          c.description_plain, c.dedup_key, c.first_seen_at, c.last_seen_at,
          c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
          NULL as ats, NULL as board_token, NULL as source_job_id, NULL as source_url, NULL as apply_url,
          n.id as normalized_id, n.source_origin, n.current_stage, n.is_favorited,
          n.is_unicorn, n.is_flagged, n.ats_score, n.career_score, n.outlook_score,
          n.master_score, n.match_score, n.keywords, n.analyzed_at,
          n.quick_analysis, n.gap_analysis, n.unicorn_reason, n.workplace_type,
          n.job_title, n.employer_name
        FROM canonical_jobs c
        LEFT JOIN normalized_jobs n ON n.canonical_job_id = c.id
        WHERE c.is_listed = 1
        AND c.id NOT IN (SELECT DISTINCT canonical_id FROM job_sources)
        ${subFilterClause}
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC
        LIMIT ? OFFSET ?
      `;
      if (subFilter) {
        countParams.push(subFilter);
        params.push(subFilter);
      }
      params.push(pageSize, offset);
    } else if (filter === 'agent-found') {
      const subFilterClause = subFilter ? `AND n.source_origin = ?` : `AND n.source_origin IN ('adzuna','jooble','remotive')`;

      countSql = `
        SELECT COUNT(*) as cnt
        FROM normalized_jobs n
        LEFT JOIN canonical_jobs c ON c.id = n.canonical_job_id
        WHERE n.source_origin IN ('adzuna','jooble','remotive')
        ${subFilter ? `AND n.source_origin = ?` : ''}
      `;
      dataSql = `
        SELECT
          COALESCE(c.id, '') as id,
          COALESCE(c.company_display, n.employer_name) as company_display,
          COALESCE(c.title_display, n.job_title) as title_display,
          COALESCE(c.location_display, n.location) as location_display,
          c.remote,
          c.employment_type, c.experience_level, c.department, c.team,
          COALESCE(c.description_plain, n.description) as description_plain,
          c.dedup_key, c.first_seen_at, c.last_seen_at,
          c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
          NULL as ats, NULL as board_token, NULL as source_job_id,
          n.source_url, NULL as apply_url,
          n.id as normalized_id, n.source_origin, n.current_stage, n.is_favorited,
          n.is_unicorn, n.is_flagged, n.ats_score, n.career_score, n.outlook_score,
          n.master_score, n.match_score, n.keywords, n.analyzed_at,
          n.quick_analysis, n.gap_analysis, n.unicorn_reason, n.workplace_type,
          n.job_title, n.employer_name
        FROM normalized_jobs n
        LEFT JOIN canonical_jobs c ON c.id = n.canonical_job_id
        WHERE ${subFilterClause.replace('AND ', '')}
        ORDER BY n.created_at DESC
        LIMIT ? OFFSET ?
      `;
      if (subFilter) {
        countParams.push(subFilter);
        params.push(subFilter);
      }
      params.push(pageSize, offset);
    } else if (filter === 'archived') {
      const subFilterClause = subFilter ? `AND n.source_origin = ?` : '';

      countSql = `
        SELECT COUNT(*) as cnt
        FROM normalized_jobs n
        WHERE n.current_stage = 'Archived'
        ${subFilterClause}
      `;
      dataSql = `
        SELECT
          COALESCE(c.id, '') as id,
          COALESCE(c.company_display, n.employer_name) as company_display,
          COALESCE(c.title_display, n.job_title) as title_display,
          COALESCE(c.location_display, n.location) as location_display,
          c.remote,
          c.employment_type, c.experience_level, c.department, c.team,
          COALESCE(c.description_plain, n.description) as description_plain,
          c.dedup_key, c.first_seen_at, c.last_seen_at,
          c.expires_at, c.compensation_min, c.compensation_max, c.compensation_currency,
          NULL as ats, NULL as board_token, NULL as source_job_id,
          n.source_url, NULL as apply_url,
          n.id as normalized_id, n.source_origin, n.current_stage, n.is_favorited,
          n.is_unicorn, n.is_flagged, n.ats_score, n.career_score, n.outlook_score,
          n.master_score, n.match_score, n.keywords, n.analyzed_at,
          n.quick_analysis, n.gap_analysis, n.unicorn_reason, n.workplace_type,
          n.job_title, n.employer_name
        FROM normalized_jobs n
        LEFT JOIN canonical_jobs c ON c.id = n.canonical_job_id
        WHERE n.current_stage = 'Archived'
        ${subFilterClause}
        ORDER BY n.updated_at DESC
        LIMIT ? OFFSET ?
      `;
      if (subFilter) {
        countParams.push(subFilter);
        params.push(subFilter);
      }
      params.push(pageSize, offset);
    }

    const [totalRes, dataRes] = await Promise.all([
      db.prepare(countSql).bind(...countParams).first<{ cnt: number }>(),
      db.prepare(dataSql).bind(...params).all<any>(),
    ]);

    const rawJobs = dataRes.results || [];
    const total = totalRes?.cnt || 0;

    // For canonical-based filters, fetch all sources per canonical job
    let allSourcesMap: Record<string, Array<{ ats: string; boardToken: string; sourceJobId: string; sourceUrl: string; applyUrl: string }>> = {};
    if ((filter === 'total' || filter === 'active' || filter === 'crawler' || filter === 'manual') && rawJobs.length > 0) {
      const ids = rawJobs.map((j: any) => j.id).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const { results: sourcesRows } = await db.prepare(`
          SELECT canonical_id, ats, board_token, source_job_id, source_url, apply_url
          FROM job_sources
          WHERE canonical_id IN (${placeholders})
          ORDER BY first_seen_at ASC
        `).bind(...ids).all<any>();

        for (const s of sourcesRows || []) {
          if (!allSourcesMap[s.canonical_id]) allSourcesMap[s.canonical_id] = [];
          allSourcesMap[s.canonical_id].push({
            ats: s.ats,
            boardToken: s.board_token,
            sourceJobId: s.source_job_id,
            sourceUrl: s.source_url,
            applyUrl: s.apply_url,
          });
        }
      }
    }

    const jobs: JobDetailRow[] = rawJobs.map((r: any) => ({
      id: r.id || '',
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
      compensationMin: r.compensation_min || null,
      compensationMax: r.compensation_max || null,
      compensationCurrency: r.compensation_currency || null,
      ats: r.ats || null,
      boardToken: r.board_token || null,
      sourceJobId: r.source_job_id || null,
      sourceUrl: r.source_url || null,
      applyUrl: r.apply_url || null,
      allSources: allSourcesMap[r.id] || [],
      normalizedId: r.normalized_id || null,
      sourceOrigin: r.source_origin || null,
      currentStage: r.current_stage || null,
      isFavorited: r.is_favorited === 1,
      isUnicorn: r.is_unicorn === 1,
      isFlagged: r.is_flagged === 1,
      atsScore: r.ats_score ?? null,
      careerScore: r.career_score ?? null,
      outlookScore: r.outlook_score ?? null,
      masterScore: r.master_score ?? null,
      matchScore: r.match_score ?? null,
      keywords: r.keywords || null,
      analyzedAt: r.analyzed_at || null,
      quickAnalysis: r.quick_analysis || null,
      gapAnalysis: r.gap_analysis || null,
      unicornReason: r.unicorn_reason || null,
      workplaceType: r.workplace_type || null,
      jobTitle: r.job_title || null,
      employerName: r.employer_name || null,
    }));

    return { jobs, total };
  });

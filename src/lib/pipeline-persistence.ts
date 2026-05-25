'use server';
/**
 * Unified Pipeline Persistence Layer
 *
 * Operates on the `pipeline_jobs` table — single source of truth for all jobs
 * whether discovered by agents (LinkedIn, Greenhouse, Lever, Workable)
 * or manually analyzed.
 *
 * Replaces the split between linkedin-persistence.ts and get-history.ts.
 */

import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/db';
import {
  appSettings,
  pipelineJobs,
  linkedinSavedSearches,
  generatedDocuments,
  searchLogs,
  type AppSettings,
  type PipelineJob,
} from '@/db/schema';
import { getCloudflareEnv } from '@/lib/cloudflare';
import type { SessionUser } from '@/lib/cloudflare';
import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';
import {
  type PipelineStatus,
  type PipelineCounts,
  type PipelineStatusKey,
  PIPELINE_STATUSES,
  EMPTY_PIPELINE_COUNTS,
  STATUS_TO_KEY,
  normalizePipelineStatus,
} from '@/lib/pipeline-constants';

// ─── Re-export types ──────────────────────────────────────────────────────────

export type { PipelineStatus, PipelineCounts, PipelineStatusKey };

export type PipelineJobRow = PipelineJob & {
  ownerEmail?: string | null;
  documents?: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
};

export type SavedSearchRow = {
  id: number;
  userId: string;
  name: string;
  criteria: LinkedInSearchParams;
  isActive: boolean;
  runIntervalHours: number;
  sources: string[];
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRunning?: boolean;
};

export type PipelineAppSettings = {
  linkedinRetentionDays: number;
  linkedinAutoPrune: boolean;
  linkedinAllowAllUsersView: boolean;
  linkedinSearchCronFrequency: string;
  linkedinCronStartHour: number;
  linkedinCronVarianceMinutes: number;
  updatedAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SQLITE_MAX_BOUND_PARAMETERS = 90;
const SQLITE_DELETE_BATCH_SIZE = SQLITE_MAX_BOUND_PARAMETERS;
const SQLITE_URL_LOOKUP_BATCH_SIZE = SQLITE_MAX_BOUND_PARAMETERS - 1;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

const DEFAULT_SETTINGS: PipelineAppSettings = {
  linkedinRetentionDays: 14,
  linkedinAutoPrune: true,
  linkedinAllowAllUsersView: false,
  linkedinSearchCronFrequency: 'daily',
  linkedinCronStartHour: 9,
  linkedinCronVarianceMinutes: 20,
  updatedAt: new Date(0).toISOString(),
};

// ─── URL Normalization ────────────────────────────────────────────────────────

export function canonicalizePipelineJobUrl(rawUrl: string, externalJobId?: string): string {
  try {
    const url = new URL(rawUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    if (normalizedPath.includes('/jobs/view/')) {
      return `https://www.linkedin.com${normalizedPath}/`;
    }
    const currentJobId = url.searchParams.get('currentJobId');
    if (currentJobId) {
      return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
    }
  } catch {
    if (externalJobId && /^\d+$/.test(externalJobId)) {
      return `https://www.linkedin.com/jobs/view/${externalJobId}/`;
    }
  }
  if (externalJobId && /^\d+$/.test(externalJobId)) {
    return `https://www.linkedin.com/jobs/view/${externalJobId}/`;
  }
  return rawUrl;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function normalizeSettings(row?: AppSettings | null): PipelineAppSettings {
  if (!row) return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  return {
    linkedinRetentionDays: row.linkedinRetentionDays ?? DEFAULT_SETTINGS.linkedinRetentionDays,
    linkedinAutoPrune: row.linkedinAutoPrune === 1,
    linkedinAllowAllUsersView: row.linkedinAllowAllUsersView === 1,
    linkedinSearchCronFrequency: row.linkedinSearchCronFrequency ?? DEFAULT_SETTINGS.linkedinSearchCronFrequency,
    linkedinCronStartHour: row.linkedinCronStartHour ?? DEFAULT_SETTINGS.linkedinCronStartHour,
    linkedinCronVarianceMinutes: row.linkedinCronVarianceMinutes ?? DEFAULT_SETTINGS.linkedinCronVarianceMinutes,
    updatedAt: row.updatedAt,
  };
}

export async function getPipelineSettings(): Promise<PipelineAppSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) return DEFAULT_SETTINGS;
  const db = getDb(env.DB);
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return normalizeSettings(row);
}

// ─── Upsert Jobs ──────────────────────────────────────────────────────────────

export async function upsertPipelineJobs(args: {
  userId: string;
  savedSearchId?: number | null;
  searchUrl: string;
  criteria: LinkedInSearchParams;
  jobs: LinkedInScrapedJob[];
  sourceName?: string;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  for (const job of args.jobs) {
    const canonicalSourceUrl = canonicalizePipelineJobUrl(job.sourceUrl, job.id);
    const [existing] = await db
      .select()
      .from(pipelineJobs)
      .where(and(eq(pipelineJobs.userId, args.userId), eq(pipelineJobs.canonicalSourceUrl, canonicalSourceUrl)))
      .limit(1);

    if (existing) {
      const shouldBackfillWorkplaceType = !existing.workplaceType && job.workplaceType;
      const shouldRefreshLastSeenAt = existing.lastSeenAt !== now;
      if (shouldBackfillWorkplaceType || shouldRefreshLastSeenAt) {
        await db
          .update(pipelineJobs)
          .set({
            workplaceType: shouldBackfillWorkplaceType ? job.workplaceType : existing.workplaceType,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(pipelineJobs.id, existing.id));
      }
      continue;
    }

    const values = {
      userId: args.userId,
      savedSearchId: args.savedSearchId ?? null,
      externalJobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      sourceUrl: job.sourceUrl,
      canonicalSourceUrl,
      sourceName: args.sourceName ?? job.sourceName ?? 'LinkedIn',
      searchUrl: args.searchUrl,
      criteria: JSON.stringify(args.criteria),
      salary: job.salary ?? null,
      snippet: job.snippet ?? null,
      description: job.description ?? null,
      postDateText: job.postDateText ?? null,
      workplaceType: job.workplaceType ?? null,
      atsScore: job.score?.atsScore ?? null,
      careerScore: job.score?.careerScore ?? null,
      outlookScore: job.score?.outlookScore ?? null,
      masterScore: job.score?.masterScore ?? null,
      atsReason: job.score?.atsReason ?? null,
      careerReason: job.score?.careerReason ?? null,
      outlookReason: job.score?.outlookReason ?? null,
      isUnicorn: job.score?.isUnicorn ? 1 : 0,
      unicornReason: job.score?.unicornReason ?? null,
      status: 'Discovered' as const,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(pipelineJobs).values(values);
  }

  if (args.savedSearchId) {
    await db
      .update(linkedinSavedSearches)
      .set({ lastRunAt: now, updatedAt: now })
      .where(eq(linkedinSavedSearches.id, args.savedSearchId));
  }
}

// ─── Find Existing ────────────────────────────────────────────────────────────

export async function findExistingPipelineJobs(args: {
  userId: string;
  jobs: Pick<LinkedInScrapedJob, 'id' | 'sourceUrl'>[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB || args.jobs.length === 0) return new Map<string, PipelineJob>();

  const db = getDb(env.DB);
  const canonicalUrls = Array.from(
    new Set(
      args.jobs
        .map((job) => canonicalizePipelineJobUrl(job.sourceUrl, job.id))
        .filter((url) => !!url),
    ),
  );

  if (canonicalUrls.length === 0) return new Map<string, PipelineJob>();

  const rows: PipelineJob[] = [];
  for (const canonicalUrlBatch of chunkValues(canonicalUrls, SQLITE_URL_LOOKUP_BATCH_SIZE)) {
    const batchRows = await db
      .select()
      .from(pipelineJobs)
      .where(
        and(
          eq(pipelineJobs.userId, args.userId),
          inArray(pipelineJobs.canonicalSourceUrl, canonicalUrlBatch),
        ),
      );
    rows.push(...batchRows);
  }

  return new Map(rows.map((row) => [row.canonicalSourceUrl, row]));
}

// ─── List Pipeline Jobs (unified query) ───────────────────────────────────────

export async function listPipelineJobs(args: {
  user: SessionUser;
  page?: number;
  pageSize?: number;
  query?: string;
  remote?: boolean;
  green?: boolean;
  sortBy?: string;
  status?: string;
  excludeDiscovered?: boolean;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) return { rows: [] as PipelineJobRow[], total: 0, canViewAllUsers: false, statusCounts: {} as Partial<Record<PipelineStatus, number>>, pipelineCounts: { ...EMPTY_PIPELINE_COUNTS } };
  const db = getDb(env.DB);
  const settings = await getPipelineSettings();
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const canViewAllUsers = settings.linkedinAllowAllUsersView && args.user.role === 'admin';

  const q = args.query?.trim();
  const baseWhereClause = and(
    canViewAllUsers ? undefined : eq(pipelineJobs.userId, args.user.id),
    q ? or(like(pipelineJobs.title, `%${q}%`), like(pipelineJobs.company, `%${q}%`)) : undefined,
    args.remote
      ? or(
          like(pipelineJobs.workplaceType, '%remote%'),
          like(pipelineJobs.location, '%remote%'),
          like(pipelineJobs.snippet, '%remote%'),
          like(pipelineJobs.title, '%remote%'),
        )
      : undefined,
    args.green ? gte(pipelineJobs.masterScore, 80) : undefined,
    args.excludeDiscovered ? sql`${pipelineJobs.status} != 'Discovered'` : undefined,
  );
  const whereClause = args.status
    ? and(baseWhereClause, eq(pipelineJobs.status, args.status))
    : baseWhereClause;

  const orderBy = (() => {
    switch (args.sortBy) {
      case 'title':
        return [asc(pipelineJobs.title)];
      case 'score':
        return [desc(pipelineJobs.masterScore), asc(pipelineJobs.title)];
      case 'match':
        return [desc(pipelineJobs.matchScore), asc(pipelineJobs.title)];
      case 'company':
        return [asc(pipelineJobs.company), asc(pipelineJobs.title)];
      case 'location':
        return [asc(pipelineJobs.location), asc(pipelineJobs.title)];
      default:
        return [desc(pipelineJobs.lastSeenAt), desc(pipelineJobs.masterScore)];
    }
  })();

  const rows = await db
    .select({
      id: pipelineJobs.id,
      userId: pipelineJobs.userId,
      savedSearchId: pipelineJobs.savedSearchId,
      externalJobId: pipelineJobs.externalJobId,
      title: pipelineJobs.title,
      company: pipelineJobs.company,
      location: pipelineJobs.location,
      industry: pipelineJobs.industry,
      sourceUrl: pipelineJobs.sourceUrl,
      canonicalSourceUrl: pipelineJobs.canonicalSourceUrl,
      sourceName: pipelineJobs.sourceName,
      searchUrl: pipelineJobs.searchUrl,
      criteria: pipelineJobs.criteria,
      salary: pipelineJobs.salary,
      snippet: pipelineJobs.snippet,
      description: pipelineJobs.description,
      postDateText: pipelineJobs.postDateText,
      workplaceType: pipelineJobs.workplaceType,
      atsScore: pipelineJobs.atsScore,
      careerScore: pipelineJobs.careerScore,
      outlookScore: pipelineJobs.outlookScore,
      masterScore: pipelineJobs.masterScore,
      atsReason: pipelineJobs.atsReason,
      careerReason: pipelineJobs.careerReason,
      outlookReason: pipelineJobs.outlookReason,
      isUnicorn: pipelineJobs.isUnicorn,
      unicornReason: pipelineJobs.unicornReason,
      jdText: pipelineJobs.jdText,
      matchScore: pipelineJobs.matchScore,
      gapAnalysis: pipelineJobs.gapAnalysis,
      recommendations: pipelineJobs.recommendations,
      pursue: pipelineJobs.pursue,
      pursueJustification: pipelineJobs.pursueJustification,
      keywords: pipelineJobs.keywords,
      strategyNote: pipelineJobs.strategyNote,
      personalInterest: pipelineJobs.personalInterest,
      careerAnalysis: pipelineJobs.careerAnalysis,
      insights: pipelineJobs.insights,
      status: pipelineJobs.status,
      firstSeenAt: pipelineJobs.firstSeenAt,
      lastSeenAt: pipelineJobs.lastSeenAt,
      analyzedAt: pipelineJobs.analyzedAt,
      createdAt: pipelineJobs.createdAt,
      updatedAt: pipelineJobs.updatedAt,
      ownerEmail: sql<string | null>`${sql.raw(canViewAllUsers ? "(select email from users where users.id = pipeline_jobs.user_id)" : "null")}`,
    })
    .from(pipelineJobs)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pipelineJobs)
    .where(whereClause);

  const statusRows = await db
    .select({
      status: pipelineJobs.status,
      count: sql<number>`count(*)`,
    })
    .from(pipelineJobs)
    .where(baseWhereClause)
    .groupBy(pipelineJobs.status);

  const normalizedRows: PipelineJobRow[] = await Promise.all(
    rows.map(async (row) => {
      const docs = await db
        .select({
          id: generatedDocuments.id,
          docType: generatedDocuments.docType,
          r2Key: generatedDocuments.r2Key,
          fileName: generatedDocuments.fileName,
        })
        .from(generatedDocuments)
        .where(eq(generatedDocuments.pipelineJobId, row.id))
        .orderBy(desc(generatedDocuments.id));

      return {
        ...row,
        status: normalizePipelineStatus(row.status),
        documents: docs.map((d) => ({
          id: d.id,
          docType: d.docType,
          r2Key: d.r2Key,
          fileName: d.fileName ?? '',
        })),
      };
    })
  );

  const statusCounts = statusRows.reduce<Partial<Record<PipelineStatus, number>>>(
    (counts, row) => {
      const status = normalizePipelineStatus(row.status);
      counts[status] = (counts[status] ?? 0) + Number(row.count ?? 0);
      return counts;
    },
    {},
  );

  // Compute pipeline counts using the camelCase keys
  const pipelineCounts = { ...EMPTY_PIPELINE_COUNTS };
  for (const [status, count] of Object.entries(statusCounts)) {
    const key = STATUS_TO_KEY[status as PipelineStatus];
    if (key) pipelineCounts[key] = count ?? 0;
  }

  return {
    rows: normalizedRows,
    total: Number(countRow?.count ?? 0),
    canViewAllUsers,
    statusCounts,
    pipelineCounts,
  };
}

// ─── Status Updates ───────────────────────────────────────────────────────────

function assertPipelineStatus(status: string): asserts status is PipelineStatus {
  if (!PIPELINE_STATUSES.includes(status as PipelineStatus)) {
    throw new Error(`Invalid pipeline status: ${status}`);
  }
}

export async function updatePipelineJobStatus(args: {
  user: SessionUser;
  id: number;
  status: PipelineStatus;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  assertPipelineStatus(args.status);
  const db = getDb(env.DB);
  const whereClause = and(
    eq(pipelineJobs.id, args.id),
    args.user.role === 'admin' ? undefined : eq(pipelineJobs.userId, args.user.id),
  );

  const [existing] = await db
    .select({ id: pipelineJobs.id })
    .from(pipelineJobs)
    .where(whereClause)
    .limit(1);

  if (!existing) throw new Error('Pipeline job not found');

  await db
    .update(pipelineJobs)
    .set({ status: args.status, updatedAt: new Date().toISOString() })
    .where(whereClause);

  return { id: args.id, status: args.status };
}

export async function bulkUpdatePipelineJobStatus(args: {
  user: SessionUser;
  ids: number[];
  status: PipelineStatus;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  assertPipelineStatus(args.status);
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { updated: 0 };

  const db = getDb(env.DB);
  let updated = 0;
  const now = new Date().toISOString();

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(pipelineJobs.id, idBatch),
      args.user.role === 'admin' ? undefined : eq(pipelineJobs.userId, args.user.id),
    );
    const rows = await db
      .select({ id: pipelineJobs.id })
      .from(pipelineJobs)
      .where(whereClause);
    if (rows.length === 0) continue;

    await db
      .update(pipelineJobs)
      .set({ status: args.status, updatedAt: now })
      .where(whereClause);
    updated += rows.length;
  }

  return { updated };
}

export async function bulkDeletePipelineJobs(args: {
  user: SessionUser;
  ids: number[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { deleted: 0 };

  const db = getDb(env.DB);
  let deleted = 0;

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(pipelineJobs.id, idBatch),
      args.user.role === 'admin' ? undefined : eq(pipelineJobs.userId, args.user.id),
    );
    const rows = await db
      .select({ id: pipelineJobs.id })
      .from(pipelineJobs)
      .where(whereClause);
    if (rows.length === 0) continue;

    // Delete associated documents
    await db.delete(generatedDocuments).where(inArray(generatedDocuments.pipelineJobId, idBatch));
    await db.delete(pipelineJobs).where(whereClause);
    deleted += rows.length;
  }

  return { deleted };
}

// ─── Saved Searches ───────────────────────────────────────────────────────────

export async function listSavedSearches(userId: string): Promise<SavedSearchRow[]> {
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(linkedinSavedSearches)
    .where(eq(linkedinSavedSearches.userId, userId))
    .orderBy(desc(linkedinSavedSearches.updatedAt));

  return Promise.all(
    rows.map(async (row) => {
      let parsedSources: string[] = ['linkedin', 'greenhouse', 'lever'];
      try {
        if (row.sources) {
          parsedSources = JSON.parse(row.sources) as string[];
        }
      } catch {
        // fallback
      }

      let isRunning = false;
      if (env.KV) {
        const running = await env.KV.get(`user:${userId}:agent:${row.id}:running`);
        isRunning = running === 'true';
      }

      return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        criteria: JSON.parse(row.criteria) as LinkedInSearchParams,
        isActive: row.isActive === 1,
        runIntervalHours: row.runIntervalHours,
        sources: parsedSources,
        lastRunAt: row.lastRunAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isRunning,
      };
    }),
  );
}

// ─── Prune ─────────────────────────────────────────────────────────────────────

export async function pruneExpiredPipelineJobs() {
  const env = getCloudflareEnv();
  if (!env.DB) return 0;
  const db = getDb(env.DB);
  const settings = await getPipelineSettings();
  if (!settings.linkedinAutoPrune) return 0;

  const cutoff = new Date(Date.now() - settings.linkedinRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  // Only prune Discovered jobs — don't prune jobs that have been analyzed or advanced
  const rows = await db
    .select({ id: pipelineJobs.id })
    .from(pipelineJobs)
    .where(and(
      lte(pipelineJobs.lastSeenAt, cutoff),
      eq(pipelineJobs.status, 'Discovered'),
    ));

  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  for (const batch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    await db.delete(pipelineJobs).where(inArray(pipelineJobs.id, batch));
  }
  return rows.length;
}

// ─── Search Logging ───────────────────────────────────────────────────────────

export async function logSearchEvent(args: {
  userId: string;
  savedSearchId?: number | null;
  eventType: string;
  platform?: string;
  agentName?: string;
  message: string;
  metadata?: Record<string, unknown>;
  level?: 'info' | 'success' | 'warning' | 'error';
}) {
  const env = getCloudflareEnv();
  if (!env.DB) return;
  const db = getDb(env.DB);
  try {
    await db.insert(searchLogs).values({
      userId: args.userId,
      savedSearchId: args.savedSearchId ?? null,
      eventType: args.eventType,
      platform: args.platform ?? null,
      agentName: args.agentName ?? null,
      message: args.message,
      metadata: args.metadata ?? null,
      level: args.level ?? 'info',
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    // Never let log writes break the main flow
    console.error('[logSearchEvent] Failed to write search log:', e);
  }
}

// ─── Backward-compat helper ───────────────────────────────────────────────────

/** Map a stored pipeline job to a LinkedInScrapedJob shape for UI compat */
export function mapPipelineJobToScrapedJob(row: PipelineJob): LinkedInScrapedJob {
  return {
    id: row.externalJobId ?? String(row.id),
    title: row.title,
    company: row.company,
    location: row.location ?? '',
    sourceUrl: row.sourceUrl,
    sourceName: 'LinkedIn',
    postDateText: row.postDateText ?? null,
    workplaceType: row.workplaceType ?? null,
    salary: row.salary ?? null,
    snippet: row.snippet ?? null,
    description: row.description ?? null,
    resultSource: 'history',
    score:
      row.masterScore == null || row.atsScore == null || row.careerScore == null || row.outlookScore == null
        ? undefined
        : {
            jobId: row.externalJobId ?? String(row.id),
            atsScore: row.atsScore,
            careerScore: row.careerScore,
            outlookScore: row.outlookScore,
            masterScore: row.masterScore,
            atsReason: row.atsReason ?? '',
            careerReason: row.careerReason ?? '',
            outlookReason: row.outlookReason ?? '',
            isUnicorn: row.isUnicorn === 1,
            unicornReason: row.unicornReason ?? null,
          },
  };
}

// ─── Documents for Pipeline Jobs ──────────────────────────────────────────────

export async function getDocumentsForPipelineJob(pipelineJobId: number) {
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);

  const docs = await db
    .select({
      id: generatedDocuments.id,
      docType: generatedDocuments.docType,
      r2Key: generatedDocuments.r2Key,
      fileName: generatedDocuments.fileName,
    })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.pipelineJobId, pipelineJobId))
    .orderBy(desc(generatedDocuments.id));

  return docs.map((d) => ({
    id: d.id,
    docType: d.docType,
    r2Key: d.r2Key,
    fileName: d.fileName ?? '',
  }));
}

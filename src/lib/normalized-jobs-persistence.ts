'use server';
/**
 * Normalized Jobs Persistence Layer
 *
 * Operates on the unified `normalized_jobs` table — single source of truth
 * for all jobs, whether global ATS-catalog rows (userId = null) or
 * per-user agent-discovered/analyzed pipeline rows (userId set).
 */

import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/db';
import {
  appSettings,
  normalizedJobs,
  searchConfigurations,
  generatedDocuments,
  user,
  type AppSettings,
  type NormalizedJob,
  type NewNormalizedJob,
} from '@/db/schema';
import { getCloudflareEnv } from '@/lib/cloudflare';
import type { SessionUser } from '@/lib/cloudflare';
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

export type NormalizedJobRow = NormalizedJob & {
  title: string;
  company: string;
  firstSeenAt?: string | null;
  ownerEmail?: string | null;
  documents?: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
  status?: PipelineStatus;
};

export type SearchConfigurationRow = {
  id: number;
  userId: string;
  name: string;
  criteria: any;
  isActive: boolean;
  runIntervalHours: number;
  sources: string[];
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRunning?: boolean;
};

export type AgentAppSettings = {
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

const DEFAULT_SETTINGS: AgentAppSettings = {
  linkedinRetentionDays: 14,
  linkedinAutoPrune: true,
  linkedinAllowAllUsersView: false,
  linkedinSearchCronFrequency: 'daily',
  linkedinCronStartHour: 9,
  linkedinCronVarianceMinutes: 20,
  updatedAt: new Date(0).toISOString(),
};

const PRUNE_RETENTION_DAYS = 30;

// ─── URL Normalization ────────────────────────────────────────────────────────

/**
 * Canonicalize a job source URL for dedup purposes. Strips tracking query
 * params and trailing slashes so the same job posting from the same source
 * maps to a stable key.
 */
export function canonicalizeJobUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return rawUrl;
  }
}

export function isUSLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  const normalized = location.toLowerCase();
  if (normalized.includes('remote')) return true;
  const usIndicators = ['united states', 'usa', 'us,', ', us'];
  return usIndicators.some((indicator) => normalized.includes(indicator));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function normalizeSettings(row?: AppSettings | null): AgentAppSettings {
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

export async function getShowGlobalJobsForUser(userId: string): Promise<boolean> {
  const env = getCloudflareEnv();
  if (!env.DB) return false;
  const db = getDb(env.DB);
  const [row] = await db.select({ showGlobalJobs: user.showGlobalJobs }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.showGlobalJobs ?? false;
}

export async function getAgentSettings(): Promise<AgentAppSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) return DEFAULT_SETTINGS;
  const db = getDb(env.DB);
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return normalizeSettings(row);
}

export async function saveAgentSettings(input: Partial<AgentAppSettings>): Promise<AgentAppSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  const existing = await getAgentSettings();
  const next: AgentAppSettings = {
    linkedinRetentionDays: Math.max(1, Math.min(365, input.linkedinRetentionDays ?? existing.linkedinRetentionDays)),
    linkedinAutoPrune: input.linkedinAutoPrune ?? existing.linkedinAutoPrune,
    linkedinAllowAllUsersView: input.linkedinAllowAllUsersView ?? existing.linkedinAllowAllUsersView,
    linkedinSearchCronFrequency: input.linkedinSearchCronFrequency ?? existing.linkedinSearchCronFrequency,
    linkedinCronStartHour: Math.max(0, Math.min(23, input.linkedinCronStartHour ?? existing.linkedinCronStartHour)),
    linkedinCronVarianceMinutes: Math.max(0, Math.min(59, input.linkedinCronVarianceMinutes ?? existing.linkedinCronVarianceMinutes)),
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(appSettings)
    .values({
      id: 1,
      linkedinRetentionDays: next.linkedinRetentionDays,
      linkedinAutoPrune: next.linkedinAutoPrune ? 1 : 0,
      linkedinAllowAllUsersView: next.linkedinAllowAllUsersView ? 1 : 0,
      linkedinSearchCronFrequency: next.linkedinSearchCronFrequency,
      linkedinCronStartHour: next.linkedinCronStartHour,
      linkedinCronVarianceMinutes: next.linkedinCronVarianceMinutes,
      updatedAt: next.updatedAt,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        linkedinRetentionDays: next.linkedinRetentionDays,
        linkedinAutoPrune: next.linkedinAutoPrune ? 1 : 0,
        linkedinAllowAllUsersView: next.linkedinAllowAllUsersView ? 1 : 0,
        linkedinSearchCronFrequency: next.linkedinSearchCronFrequency,
        linkedinCronStartHour: next.linkedinCronStartHour,
        linkedinCronVarianceMinutes: next.linkedinCronVarianceMinutes,
        updatedAt: next.updatedAt,
      },
    });

  return next;
}

// ─── FTS sync helpers ─────────────────────────────────────────────────────────

async function syncFtsInsert(db: ReturnType<typeof getDb>, row: NormalizedJob) {
  await db.run(sql`
    INSERT INTO normalized_jobs_fts (rowid, job_id, title, company, description_pruned, created_at)
    VALUES (${row.id}, ${row.id}, ${row.jobTitle}, ${row.employerName}, ${row.descriptionPruned ?? null}, ${row.createdAt})
  `);
}

async function syncFtsDelete(db: ReturnType<typeof getDb>, ids: number[]) {
  for (const batch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    for (const id of batch) {
      await db.run(sql`DELETE FROM normalized_jobs_fts WHERE rowid = ${id}`);
    }
  }
}

export async function searchNormalizedJobsFts(query: string, limit = 50, offset = 0) {
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  const escapedQuery = query.replace(/'/g, "''");
  const ftsQuery = `'${escapedQuery}'`;

  try {
    const results = await db.run(sql`
      SELECT n.*
      FROM normalized_jobs n
      INNER JOIN normalized_jobs_fts f ON n.id = f.job_id
      WHERE f MATCH ${ftsQuery}
      ORDER BY f.rank ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return results as unknown as NormalizedJob[];
  } catch (error) {
    console.error(`[normalized-jobs] FTS search error for query "${query}":`, error);
    return [];
  }
}

// ─── Upsert Jobs ──────────────────────────────────────────────────────────────

export type NormalizedJobInput = Omit<NewNormalizedJob, 'id' | 'createdAt' | 'updatedAt' | 'discoveryTimestamp' | 'lastSeenAt'> & {
  discoveryTimestamp?: string;
  lastSeenAt?: string;
};

/**
 * Upsert normalized job rows. For owned rows (userId set), dedup is keyed on
 * (userId, canonicalSourceUrl). For global rows (userId null), dedup is keyed
 * on (sourceOrigin, externalReferenceId). Existing rows get lastSeenAt
 * refreshed; AI score/analysis fields are preserved unless explicitly provided.
 */
export async function upsertNormalizedJobs(jobs: NormalizedJobInput[]): Promise<{ inserted: number; updated: number; skipped: number }> {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!isUSLocation(job.location) && job.location) {
      skipped += 1;
      continue;
    }

    const canonicalSourceUrl = job.canonicalSourceUrl ?? canonicalizeJobUrl(job.sourceUrl);

    let existing: NormalizedJob | undefined;
    if (job.userId) {
      [existing] = await db
        .select()
        .from(normalizedJobs)
        .where(and(eq(normalizedJobs.userId, job.userId), eq(normalizedJobs.canonicalSourceUrl, canonicalSourceUrl)))
        .limit(1);
    } else if (job.externalReferenceId) {
      [existing] = await db
        .select()
        .from(normalizedJobs)
        .where(
          and(
            eq(normalizedJobs.sourceOrigin, job.sourceOrigin),
            eq(normalizedJobs.externalReferenceId, job.externalReferenceId),
          ),
        )
        .limit(1);
    } else {
      [existing] = await db
        .select()
        .from(normalizedJobs)
        .where(
          and(
            sql`${normalizedJobs.userId} IS NULL`,
            eq(normalizedJobs.canonicalSourceUrl, canonicalSourceUrl),
          ),
        )
        .limit(1);
    }

    if (existing) {
      await db
        .update(normalizedJobs)
        .set({
          lastSeenAt: now,
          updatedAt: now,
          workplaceType: existing.workplaceType ?? job.workplaceType ?? null,
        })
        .where(eq(normalizedJobs.id, existing.id));
      updated += 1;
      continue;
    }

    const values: NewNormalizedJob = {
      ...job,
      canonicalSourceUrl,
      currentStage: job.currentStage ?? 'Discovered',
      isFlagged: job.isFlagged ?? false,
      isUnicorn: job.isUnicorn ?? 0,
      remoteType: job.remoteType ?? 'fully_remote',
      discoveryTimestamp: job.discoveryTimestamp ?? now,
      lastSeenAt: job.lastSeenAt ?? now,
      createdAt: now,
      updatedAt: now,
    };

    const [insertedRow] = await db.insert(normalizedJobs).values(values).onConflictDoNothing().returning();
    if (insertedRow) {
      await syncFtsInsert(db, insertedRow);
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return { inserted, updated, skipped };
}

// ─── Find Existing ────────────────────────────────────────────────────────────

export async function findExistingNormalizedJobs(args: {
  userId: string | null;
  urls: string[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB || args.urls.length === 0) return new Map<string, NormalizedJob>();

  const db = getDb(env.DB);
  const canonicalUrls = Array.from(new Set(args.urls.map((url) => canonicalizeJobUrl(url)).filter(Boolean)));
  if (canonicalUrls.length === 0) return new Map<string, NormalizedJob>();

  const rows: NormalizedJob[] = [];
  for (const batch of chunkValues(canonicalUrls, SQLITE_URL_LOOKUP_BATCH_SIZE)) {
    const batchRows = await db
      .select()
      .from(normalizedJobs)
      .where(
        and(
          args.userId ? eq(normalizedJobs.userId, args.userId) : sql`${normalizedJobs.userId} IS NULL`,
          inArray(normalizedJobs.canonicalSourceUrl, batch),
        ),
      );
    rows.push(...batchRows);
  }

  return new Map(rows.map((row) => [row.canonicalSourceUrl, row]));
}

// ─── List Normalized Jobs (unified query) ─────────────────────────────────────

export async function listNormalizedJobs(args: {
  user: SessionUser;
  includeGlobal?: boolean;
  page?: number;
  pageSize?: number;
  query?: string;
  remote?: boolean;
  green?: boolean;
  sortBy?: string;
  status?: string;
  excludeDiscovered?: boolean;
  isFavorited?: boolean;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) {
    return {
      rows: [] as NormalizedJobRow[],
      total: 0,
      canViewAllUsers: false,
      statusCounts: {} as Partial<Record<PipelineStatus, number>>,
      pipelineCounts: { ...EMPTY_PIPELINE_COUNTS },
    };
  }
  const db = getDb(env.DB);
  const settings = await getAgentSettings();
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const canViewAllUsers = settings.linkedinAllowAllUsersView && args.user.role === 'admin';

  const ownerClause = canViewAllUsers
    ? undefined
    : args.includeGlobal
      ? or(eq(normalizedJobs.userId, args.user.id), sql`${normalizedJobs.userId} IS NULL`)
      : eq(normalizedJobs.userId, args.user.id);

  const q = args.query?.trim();
  const baseWhereClause = and(
    ownerClause,
    q ? or(like(normalizedJobs.jobTitle, `%${q}%`), like(normalizedJobs.employerName, `%${q}%`)) : undefined,
    args.remote
      ? or(
          like(normalizedJobs.workplaceType, '%remote%'),
          like(normalizedJobs.location, '%remote%'),
          like(normalizedJobs.snippet, '%remote%'),
          like(normalizedJobs.jobTitle, '%remote%'),
        )
      : undefined,
    args.green ? gte(normalizedJobs.masterScore, 80) : undefined,
    args.excludeDiscovered ? sql`${normalizedJobs.currentStage} != 'Discovered'` : undefined,
    args.isFavorited !== undefined ? eq(normalizedJobs.isFavorited, args.isFavorited) : undefined,
  );
  const whereClause = args.status
    ? and(baseWhereClause, eq(normalizedJobs.currentStage, args.status as PipelineStatus))
    : baseWhereClause;

  const orderBy = (() => {
    switch (args.sortBy) {
      case 'title':
        return [asc(normalizedJobs.jobTitle)];
      case 'score':
        return [desc(normalizedJobs.masterScore), asc(normalizedJobs.jobTitle)];
      case 'match':
        return [desc(normalizedJobs.matchScore), asc(normalizedJobs.jobTitle)];
      case 'company':
        return [asc(normalizedJobs.employerName), asc(normalizedJobs.jobTitle)];
      case 'location':
        return [asc(normalizedJobs.location), asc(normalizedJobs.jobTitle)];
      default:
        return [desc(normalizedJobs.lastSeenAt), desc(normalizedJobs.masterScore)];
    }
  })();

  const rows = await db
    .select({
      id: normalizedJobs.id,
      userId: normalizedJobs.userId,
      savedSearchId: normalizedJobs.savedSearchId,
      sourceOrigin: normalizedJobs.sourceOrigin,
      externalReferenceId: normalizedJobs.externalReferenceId,
      jobTitle: normalizedJobs.jobTitle,
      employerName: normalizedJobs.employerName,
      title: normalizedJobs.jobTitle,
      company: normalizedJobs.employerName,
      location: normalizedJobs.location,
      industry: normalizedJobs.industry,
      sourceUrl: normalizedJobs.sourceUrl,
      canonicalSourceUrl: normalizedJobs.canonicalSourceUrl,
      rawPayload: normalizedJobs.rawPayload,
      searchUrl: normalizedJobs.searchUrl,
      criteria: normalizedJobs.criteria,
      description: normalizedJobs.description,
      descriptionPruned: normalizedJobs.descriptionPruned,
      salary: normalizedJobs.salary,
      snippet: normalizedJobs.snippet,
      postDateText: normalizedJobs.postDateText,
      workplaceType: normalizedJobs.workplaceType,
      remoteType: normalizedJobs.remoteType,
      categoryId: normalizedJobs.categoryId,
      atsScore: normalizedJobs.atsScore,
      careerScore: normalizedJobs.careerScore,
      outlookScore: normalizedJobs.outlookScore,
      masterScore: normalizedJobs.masterScore,
      atsReason: normalizedJobs.atsReason,
      careerReason: normalizedJobs.careerReason,
      outlookReason: normalizedJobs.outlookReason,
      isUnicorn: normalizedJobs.isUnicorn,
      unicornReason: normalizedJobs.unicornReason,
      jdText: normalizedJobs.jdText,
      matchScore: normalizedJobs.matchScore,
      gapAnalysis: normalizedJobs.gapAnalysis,
      recommendations: normalizedJobs.recommendations,
      pursue: normalizedJobs.pursue,
      pursueJustification: normalizedJobs.pursueJustification,
      keywords: normalizedJobs.keywords,
      strategyNote: normalizedJobs.strategyNote,
      personalInterest: normalizedJobs.personalInterest,
      careerAnalysis: normalizedJobs.careerAnalysis,
      insights: normalizedJobs.insights,
      currentStage: normalizedJobs.currentStage,
      finalResolution: normalizedJobs.finalResolution,
      isFlagged: normalizedJobs.isFlagged,
      discoveryTimestamp: normalizedJobs.discoveryTimestamp,
      firstSeenAt: normalizedJobs.discoveryTimestamp,
      lastSeenAt: normalizedJobs.lastSeenAt,
      analyzedAt: normalizedJobs.analyzedAt,
      isFavorited: normalizedJobs.isFavorited,
      canonicalJobId: normalizedJobs.canonicalJobId,
      createdAt: normalizedJobs.createdAt,
      updatedAt: normalizedJobs.updatedAt,
      ownerEmail: sql<string | null>`${sql.raw(canViewAllUsers ? '(select email from user where user.id = normalized_jobs.user_id)' : 'null')}`.as('ownerEmail'),
    })
    .from(normalizedJobs)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(normalizedJobs)
    .where(whereClause);

  const statusRows = await db
    .select({
      currentStage: normalizedJobs.currentStage,
      count: sql<number>`count(*)`,
    })
    .from(normalizedJobs)
    .where(baseWhereClause)
    .groupBy(normalizedJobs.currentStage);

  const normalizedRows: NormalizedJobRow[] = await Promise.all(
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
        currentStage: normalizePipelineStatus(row.currentStage),
        status: normalizePipelineStatus(row.currentStage),
        documents: docs.map((d) => ({
          id: d.id,
          docType: d.docType,
          r2Key: d.r2Key,
          fileName: d.fileName ?? '',
        })),
      } as NormalizedJobRow;
    }),
  );

  const statusCounts = statusRows.reduce<Partial<Record<PipelineStatus, number>>>((counts, row) => {
    const status = normalizePipelineStatus(row.currentStage);
    counts[status] = (counts[status] ?? 0) + Number(row.count ?? 0);
    return counts;
  }, {});

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

// ─── Stage / Flag Updates ──────────────────────────────────────────────────────

function assertPipelineStatus(status: string): asserts status is PipelineStatus {
  if (!PIPELINE_STATUSES.includes(status as PipelineStatus)) {
    throw new Error(`Invalid pipeline status: ${status}`);
  }
}

export async function setNormalizedJobStage(args: {
  user: SessionUser;
  id: number;
  currentStage: PipelineStatus;
  finalResolution?: 'Hired' | 'Not Hired' | 'Withdrawn' | null;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  assertPipelineStatus(args.currentStage);
  const db = getDb(env.DB);
  const whereClause = and(
    eq(normalizedJobs.id, args.id),
    args.user.role === 'admin' ? undefined : eq(normalizedJobs.userId, args.user.id),
  );

  const [existing] = await db.select({ id: normalizedJobs.id }).from(normalizedJobs).where(whereClause).limit(1);
  if (!existing) throw new Error('Job not found');

  await db
    .update(normalizedJobs)
    .set({
      currentStage: args.currentStage,
      finalResolution: args.finalResolution ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(whereClause);

  return { id: args.id, currentStage: args.currentStage };
}

export async function setNormalizedJobFlag(args: {
  user: SessionUser;
  id: number;
  isFlagged: boolean;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  const whereClause = and(
    eq(normalizedJobs.id, args.id),
    args.user.role === 'admin' ? undefined : eq(normalizedJobs.userId, args.user.id),
  );

  const [existing] = await db.select({ id: normalizedJobs.id }).from(normalizedJobs).where(whereClause).limit(1);
  if (!existing) throw new Error('Job not found');

  await db
    .update(normalizedJobs)
    .set({ isFlagged: args.isFlagged, updatedAt: new Date().toISOString() })
    .where(whereClause);

  return { id: args.id, isFlagged: args.isFlagged };
}

export async function bulkUpdateNormalizedJobStage(args: {
  user: SessionUser;
  ids: number[];
  currentStage: PipelineStatus;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  assertPipelineStatus(args.currentStage);
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { updated: 0 };

  const db = getDb(env.DB);
  let updatedCount = 0;
  const now = new Date().toISOString();

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(normalizedJobs.id, idBatch),
      args.user.role === 'admin' ? undefined : eq(normalizedJobs.userId, args.user.id),
    );
    const rows = await db.select({ id: normalizedJobs.id }).from(normalizedJobs).where(whereClause);
    if (rows.length === 0) continue;

    await db.update(normalizedJobs).set({ currentStage: args.currentStage, updatedAt: now }).where(whereClause);
    updatedCount += rows.length;
  }

  return { updated: updatedCount };
}

export async function bulkDeleteNormalizedJobs(args: { user: SessionUser; ids: number[] }) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { deleted: 0 };

  const db = getDb(env.DB);
  let deletedCount = 0;

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(normalizedJobs.id, idBatch),
      args.user.role === 'admin' ? undefined : eq(normalizedJobs.userId, args.user.id),
    );
    const rows = await db.select({ id: normalizedJobs.id }).from(normalizedJobs).where(whereClause);
    if (rows.length === 0) continue;

    await db.delete(generatedDocuments).where(inArray(generatedDocuments.pipelineJobId, idBatch));
    await db.delete(normalizedJobs).where(whereClause);
    await syncFtsDelete(db, rows.map((r) => r.id));
    deletedCount += rows.length;
  }

  return { deleted: deletedCount };
}

// ─── Search Configurations (Agents) ───────────────────────────────────────────

export async function listSearchConfigurations(userId: string): Promise<SearchConfigurationRow[]> {
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(searchConfigurations)
    .where(eq(searchConfigurations.userId, userId))
    .orderBy(desc(searchConfigurations.updatedAt));

  return Promise.all(
    rows.map(async (row) => {
      let parsedSources: string[] = ['adzuna', 'greenhouse', 'lever'];
      try {
        if (row.sources) parsedSources = JSON.parse(row.sources) as string[];
      } catch {
        // fallback
      }

      let parsedCriteria: Record<string, unknown> = {};
      try {
        parsedCriteria = JSON.parse(row.criteria) as Record<string, unknown>;
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
        criteria: parsedCriteria,
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

export async function saveSearchConfiguration(args: {
  userId: string;
  name: string;
  criteria: Record<string, unknown>;
  id?: number;
  isActive?: boolean;
  runIntervalHours?: number;
  sources?: string[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const values = {
    userId: args.userId,
    name: args.name.trim(),
    criteria: JSON.stringify(args.criteria),
    isActive: args.isActive === false ? 0 : 1,
    runIntervalHours: args.runIntervalHours ?? 24,
    sources: JSON.stringify(args.sources ?? ['adzuna', 'greenhouse', 'lever']),
    updatedAt: now,
  };

  if (args.id) {
    await db.update(searchConfigurations).set(values).where(eq(searchConfigurations.id, args.id));
    return args.id;
  }

  const inserted = await db
    .insert(searchConfigurations)
    .values({ ...values, createdAt: now, lastRunAt: null })
    .returning({ id: searchConfigurations.id });
  return inserted[0]?.id ?? null;
}

export async function deleteSearchConfiguration(id: number, userId: string) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);

  await db
    .update(normalizedJobs)
    .set({ savedSearchId: null, updatedAt: new Date().toISOString() })
    .where(and(eq(normalizedJobs.savedSearchId, id), eq(normalizedJobs.userId, userId)));

  await db.delete(searchConfigurations).where(and(eq(searchConfigurations.id, id), eq(searchConfigurations.userId, userId)));
}

export async function setSearchConfigurationActive(id: number, userId: string, isActive: boolean) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error('Database unavailable');
  const db = getDb(env.DB);
  await db
    .update(searchConfigurations)
    .set({ isActive: isActive ? 1 : 0, updatedAt: new Date().toISOString() })
    .where(and(eq(searchConfigurations.id, id), eq(searchConfigurations.userId, userId)));
}

// ─── Prune ─────────────────────────────────────────────────────────────────────

/**
 * Unified pruning rule: delete unflagged rows older than 30 days. Global
 * (userId IS NULL) Discovered-stage rows additionally use the shorter
 * `linkedinRetentionDays` setting as a faster secondary pass to control
 * ATS-catalog churn.
 */
export async function pruneNormalizedJobs(): Promise<number> {
  const env = getCloudflareEnv();
  if (!env.DB) return 0;
  const db = getDb(env.DB);
  const settings = await getAgentSettings();

  const mainCutoff = new Date(Date.now() - PRUNE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const idsToDelete = new Set<number>();

  const mainRows = await db
    .select({ id: normalizedJobs.id })
    .from(normalizedJobs)
    .where(and(eq(normalizedJobs.isFlagged, false), lte(normalizedJobs.discoveryTimestamp, mainCutoff)));
  mainRows.forEach((r) => idsToDelete.add(r.id));

  if (settings.linkedinAutoPrune) {
    const globalCutoff = new Date(Date.now() - settings.linkedinRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const globalRows = await db
      .select({ id: normalizedJobs.id })
      .from(normalizedJobs)
      .where(
        and(
          sql`${normalizedJobs.userId} IS NULL`,
          eq(normalizedJobs.currentStage, 'Discovered'),
          eq(normalizedJobs.isFlagged, false),
          lte(normalizedJobs.lastSeenAt, globalCutoff),
        ),
      );
    globalRows.forEach((r) => idsToDelete.add(r.id));
  }

  if (idsToDelete.size === 0) return 0;

  const ids = Array.from(idsToDelete);
  for (const batch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    await db.delete(generatedDocuments).where(inArray(generatedDocuments.pipelineJobId, batch));
    await db.delete(normalizedJobs).where(inArray(normalizedJobs.id, batch));
    await syncFtsDelete(db, batch);
  }
  return ids.length;
}

// ─── Documents for Normalized Jobs ────────────────────────────────────────────

export async function getDocumentsForNormalizedJob(normalizedJobId: number) {
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
    .where(eq(generatedDocuments.pipelineJobId, normalizedJobId))
    .orderBy(desc(generatedDocuments.id));

  return docs.map((d) => ({
    id: d.id,
    docType: d.docType,
    r2Key: d.r2Key,
    fileName: d.fileName ?? '',
  }));
}

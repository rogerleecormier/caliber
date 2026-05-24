import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/db";
import {
  appSettings,
  linkedinJobResults,
  linkedinSavedSearches,
  type AppSettings,
  type LinkedinJobResult,
} from "@/db/schema";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import type { LinkedInScrapedJob, LinkedInSearchParams } from "@/lib/linkedin-search";

export type LinkedinCronFrequency = "hourly" | "every_2_hours" | "every_4_hours" | "every_8_hours" | "every_12_hours" | "daily";
export type LinkedinJobStatus = "Analyzed" | "Prepped" | "Applied" | "Interviewed" | "Hired" | "Archived";

const LINKEDIN_JOB_STATUSES: LinkedinJobStatus[] = [
  "Analyzed",
  "Prepped",
  "Applied",
  "Interviewed",
  "Hired",
  "Archived",
];

function normalizeLinkedinJobStatus(status: string | null | undefined): LinkedinJobStatus {
  switch (status) {
    case "Analyzed":
    case "Prepped":
    case "Applied":
    case "Interviewed":
    case "Hired":
    case "Archived":
      return status;
    case "Docs Started":
    case "Ready to Apply":
      return "Prepped";
    case "Interviewing":
      return "Interviewed";
    case "Rejected":
      return "Archived";
    case "Review":
    case "Pursue":
    case "Saved":
    default:
      return "Analyzed";
  }
}

export type LinkedinAppSettings = {
  linkedinRetentionDays: number;
  linkedinAutoPrune: boolean;
  linkedinAllowAllUsersView: boolean;
  linkedinSearchCronFrequency: LinkedinCronFrequency;
  linkedinCronStartHour: number;
  linkedinCronVarianceMinutes: number;
  updatedAt: string;
};

export type SavedLinkedinSearchRow = {
  id: number;
  userId: number;
  name: string;
  criteria: LinkedInSearchParams;
  isActive: boolean;
  runIntervalHours: number;
  sources: string[];
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkedinHistoryRow = LinkedinJobResult & {
  ownerEmail?: string | null;
};

type LinkedinJobIdentityInput = {
  title: string;
  company: string;
  location: string;
};

function assertLinkedinJobStatus(status: string): asserts status is LinkedinJobStatus {
  if (!LINKEDIN_JOB_STATUSES.includes(status as LinkedinJobStatus)) {
    throw new Error("Invalid LinkedIn job status");
  }
}

const DEFAULT_SETTINGS: LinkedinAppSettings = {
  linkedinRetentionDays: 14,
  linkedinAutoPrune: true,
  linkedinAllowAllUsersView: false,
  linkedinSearchCronFrequency: "daily",
  linkedinCronStartHour: 9,
  linkedinCronVarianceMinutes: 20,
  updatedAt: new Date(0).toISOString(),
};

const COMPANY_STOP_WORDS = new Set([
  "the",
  "company",
  "co",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "group",
  "holdings",
  "holding",
  "solutions",
  "services",
  "technologies",
  "technology",
  "systems",
  "international",
  "global",
  "experience",
  "experiences",
]);

const SQLITE_MAX_BOUND_PARAMETERS = 90;
const SQLITE_DELETE_BATCH_SIZE = SQLITE_MAX_BOUND_PARAMETERS;
const SQLITE_URL_LOOKUP_BATCH_SIZE = SQLITE_MAX_BOUND_PARAMETERS - 1;
const SQLITE_SEMANTIC_LOOKUP_BATCH_SIZE = Math.max(1, Math.floor((SQLITE_MAX_BOUND_PARAMETERS - 1) / 2));

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeForKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeCompanyFingerprint(company: string) {
  const tokens = normalizeForKey(company)
    .split(" ")
    .filter((token) => token && !COMPANY_STOP_WORDS.has(token));
  return tokens.length > 0 ? tokens.slice(0, 3).join(" ") : normalizeForKey(company);
}

export function buildLinkedinJobSemanticKey(job: LinkedinJobIdentityInput) {
  const title = normalizeForKey(job.title);
  const location = normalizeForKey(job.location);
  const company = normalizeCompanyFingerprint(job.company);
  return `${title}::${company}::${location}`;
}

export function canonicalizeLinkedinJobUrl(rawUrl: string, externalJobId?: string): string {
  try {
    const url = new URL(rawUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (normalizedPath.includes("/jobs/view/")) {
      return `https://www.linkedin.com${normalizedPath}/`;
    }
    const currentJobId = url.searchParams.get("currentJobId");
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

function normalizeSettings(row?: AppSettings | null): LinkedinAppSettings {
  if (!row) return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  return {
    linkedinRetentionDays: row.linkedinRetentionDays ?? DEFAULT_SETTINGS.linkedinRetentionDays,
    linkedinAutoPrune: row.linkedinAutoPrune === 1,
    linkedinAllowAllUsersView: row.linkedinAllowAllUsersView === 1,
    linkedinSearchCronFrequency: (row.linkedinSearchCronFrequency as LinkedinCronFrequency) ?? DEFAULT_SETTINGS.linkedinSearchCronFrequency,
    linkedinCronStartHour: row.linkedinCronStartHour ?? DEFAULT_SETTINGS.linkedinCronStartHour,
    linkedinCronVarianceMinutes: row.linkedinCronVarianceMinutes ?? DEFAULT_SETTINGS.linkedinCronVarianceMinutes,
    updatedAt: row.updatedAt,
  };
}

export async function getLinkedinSettings(): Promise<LinkedinAppSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) return DEFAULT_SETTINGS;
  const db = getDb(env.DB);
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return normalizeSettings(row);
}

export async function saveLinkedinSettings(input: Partial<LinkedinAppSettings>): Promise<LinkedinAppSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);
  const existing = await getLinkedinSettings();
  const next: LinkedinAppSettings = {
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

export async function upsertLinkedinJobResults(args: {
  userId: number;
  savedSearchId?: number | null;
  searchUrl: string;
  criteria: LinkedInSearchParams;
  jobs: LinkedInScrapedJob[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  for (const job of args.jobs) {
    const canonicalSourceUrl = canonicalizeLinkedinJobUrl(job.sourceUrl, job.id);
    const [existing] = await db
      .select()
      .from(linkedinJobResults)
      .where(and(eq(linkedinJobResults.userId, args.userId), eq(linkedinJobResults.canonicalSourceUrl, canonicalSourceUrl)))
      .limit(1);

    if (existing) {
      const shouldBackfillWorkplaceType = !existing.workplaceType && job.workplaceType;
      const shouldRefreshLastSeenAt = existing.lastSeenAt !== now;
      if (shouldBackfillWorkplaceType || shouldRefreshLastSeenAt) {
        await db
          .update(linkedinJobResults)
          .set({
            workplaceType: shouldBackfillWorkplaceType ? job.workplaceType : existing.workplaceType,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(linkedinJobResults.id, existing.id));
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
      sourceName: job.sourceName,
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
      status: "Analyzed" as const,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(linkedinJobResults).values(values);
  }

  if (args.savedSearchId) {
    await db
      .update(linkedinSavedSearches)
      .set({ lastRunAt: now, updatedAt: now })
      .where(eq(linkedinSavedSearches.id, args.savedSearchId));
  }
}

export async function findExistingLinkedinJobs(args: {
  userId: number;
  jobs: Pick<LinkedInScrapedJob, "id" | "sourceUrl">[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB || args.jobs.length === 0) return new Map<string, LinkedinJobResult>();

  const db = getDb(env.DB);
  const canonicalUrls = Array.from(
    new Set(
      args.jobs
        .map((job) => canonicalizeLinkedinJobUrl(job.sourceUrl, job.id))
        .filter((url) => !!url),
    ),
  );

  if (canonicalUrls.length === 0) return new Map<string, LinkedinJobResult>();

  const rows: LinkedinJobResult[] = [];
  for (const canonicalUrlBatch of chunkValues(canonicalUrls, SQLITE_URL_LOOKUP_BATCH_SIZE)) {
    const batchRows = await db
      .select()
      .from(linkedinJobResults)
      .where(
        and(
          eq(linkedinJobResults.userId, args.userId),
          inArray(linkedinJobResults.canonicalSourceUrl, canonicalUrlBatch),
        ),
      );
    rows.push(...batchRows);
  }

  return new Map(rows.map((row) => [row.canonicalSourceUrl, row]));
}

export async function findSemanticallyMatchingExistingLinkedinJobs(args: {
  userId: number;
  jobs: Array<Pick<LinkedInScrapedJob, "title" | "company" | "location">>;
}) {
  const env = getCloudflareEnv();
  if (!env.DB || args.jobs.length === 0) return new Map<string, LinkedinJobResult>();

  const db = getDb(env.DB);
  const rows: LinkedinJobResult[] = [];

  for (const jobBatch of chunkValues(args.jobs, SQLITE_SEMANTIC_LOOKUP_BATCH_SIZE)) {
    const candidateTitles = Array.from(new Set(jobBatch.map((job) => job.title).filter(Boolean)));
    const candidateLocations = Array.from(new Set(jobBatch.map((job) => job.location).filter(Boolean)));

    if (candidateTitles.length === 0 || candidateLocations.length === 0) {
      continue;
    }

    const batchRows = await db
      .select()
      .from(linkedinJobResults)
      .where(
        and(
          eq(linkedinJobResults.userId, args.userId),
          inArray(linkedinJobResults.title, candidateTitles),
          inArray(linkedinJobResults.location, candidateLocations),
        ),
      );
    rows.push(...batchRows);
  }

  const map = new Map<string, LinkedinJobResult>();
  for (const row of rows) {
    const key = buildLinkedinJobSemanticKey({
      title: row.title,
      company: row.company,
      location: row.location,
    });
    const existing = map.get(key);
    if (!existing || (row.masterScore ?? 0) > (existing.masterScore ?? 0)) {
      map.set(key, row);
    }
  }

  return map;
}

export function mapStoredLinkedinJobToScrapedJob(row: LinkedinJobResult): LinkedInScrapedJob {
  return {
    id: row.externalJobId,
    title: row.title,
    company: row.company,
    location: row.location,
    sourceUrl: row.sourceUrl,
    sourceName: "LinkedIn",
    postDateText: row.postDateText ?? null,
    workplaceType: row.workplaceType ?? null,
    salary: row.salary ?? null,
    snippet: row.snippet ?? null,
    description: row.description ?? null,
    resultSource: "history",
    score:
      row.masterScore == null || row.atsScore == null || row.careerScore == null || row.outlookScore == null
        ? undefined
        : {
            jobId: row.externalJobId,
            atsScore: row.atsScore,
            careerScore: row.careerScore,
            outlookScore: row.outlookScore,
            masterScore: row.masterScore,
            atsReason: row.atsReason ?? "",
            careerReason: row.careerReason ?? "",
            outlookReason: row.outlookReason ?? "",
            isUnicorn: row.isUnicorn === 1,
            unicornReason: row.unicornReason ?? null,
          },
  };
}

export async function listSavedLinkedinSearches(userId: number): Promise<SavedLinkedinSearchRow[]> {
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(linkedinSavedSearches)
    .where(eq(linkedinSavedSearches.userId, userId))
    .orderBy(desc(linkedinSavedSearches.updatedAt));

  return rows.map((row) => {
    let parsedSources: string[] = ["linkedin", "greenhouse", "lever"];
    try {
      if (row.sources) {
        parsedSources = JSON.parse(row.sources) as string[];
      }
    } catch (e) {
      // fallback
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
    };
  });
}

export async function saveLinkedinSearchDefinition(args: {
  userId: number;
  name: string;
  criteria: LinkedInSearchParams;
  id?: number;
  isActive?: boolean;
  runIntervalHours?: number;
  sources?: string[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const values: any = {
    userId: args.userId,
    name: args.name.trim(),
    criteria: JSON.stringify(args.criteria),
    isActive: args.isActive === false ? 0 : 1,
    runIntervalHours: args.runIntervalHours ?? 24,
    sources: JSON.stringify(args.sources ?? ["linkedin", "greenhouse", "lever"]),
    updatedAt: now,
  };

  if (args.id) {
    await db.update(linkedinSavedSearches).set(values).where(eq(linkedinSavedSearches.id, args.id));
    return args.id;
  }

  const inserted = await db
    .insert(linkedinSavedSearches)
    .values({
      ...values,
      createdAt: now,
      lastRunAt: null,
    })
    .returning({ id: linkedinSavedSearches.id });
  return inserted[0]?.id ?? null;
}

export async function deleteLinkedinSavedSearch(id: number, userId: number) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);

  await db
    .update(linkedinJobResults)
    .set({
      savedSearchId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(linkedinJobResults.savedSearchId, id), eq(linkedinJobResults.userId, userId)));

  await db.delete(linkedinSavedSearches).where(and(eq(linkedinSavedSearches.id, id), eq(linkedinSavedSearches.userId, userId)));
}

export async function setLinkedinSavedSearchActive(id: number, userId: number, isActive: boolean) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);
  await db
    .update(linkedinSavedSearches)
    .set({
      isActive: isActive ? 1 : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(linkedinSavedSearches.id, id), eq(linkedinSavedSearches.userId, userId)));
}

export async function updateLinkedinJobStatus(args: {
  user: SessionUser;
  id: number;
  status: LinkedinJobStatus;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  assertLinkedinJobStatus(args.status);
  const db = getDb(env.DB);
  const whereClause = and(
    eq(linkedinJobResults.id, args.id),
    args.user.role === "admin" ? undefined : eq(linkedinJobResults.userId, args.user.id),
  );

  const [existing] = await db
    .select({ id: linkedinJobResults.id })
    .from(linkedinJobResults)
    .where(whereClause)
    .limit(1);

  if (!existing) throw new Error("LinkedIn job not found");

  await db
    .update(linkedinJobResults)
    .set({ status: args.status, updatedAt: new Date().toISOString() })
    .where(whereClause);

  return { id: args.id, status: args.status };
}

export async function bulkUpdateLinkedinJobStatus(args: {
  user: SessionUser;
  ids: number[];
  status: LinkedinJobStatus;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  assertLinkedinJobStatus(args.status);
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { updated: 0 };

  const db = getDb(env.DB);
  let updated = 0;
  const now = new Date().toISOString();

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(linkedinJobResults.id, idBatch),
      args.user.role === "admin" ? undefined : eq(linkedinJobResults.userId, args.user.id),
    );
    const rows = await db
      .select({ id: linkedinJobResults.id })
      .from(linkedinJobResults)
      .where(whereClause);
    if (rows.length === 0) continue;

    await db
      .update(linkedinJobResults)
      .set({ status: args.status, updatedAt: now })
      .where(whereClause);
    updated += rows.length;
  }

  return { updated };
}

export async function bulkDeleteLinkedinJobs(args: {
  user: SessionUser;
  ids: number[];
}) {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const ids = Array.from(new Set(args.ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { deleted: 0 };

  const db = getDb(env.DB);
  let deleted = 0;

  for (const idBatch of chunkValues(ids, SQLITE_DELETE_BATCH_SIZE)) {
    const whereClause = and(
      inArray(linkedinJobResults.id, idBatch),
      args.user.role === "admin" ? undefined : eq(linkedinJobResults.userId, args.user.id),
    );
    const rows = await db
      .select({ id: linkedinJobResults.id })
      .from(linkedinJobResults)
      .where(whereClause);
    if (rows.length === 0) continue;

    await db.delete(linkedinJobResults).where(whereClause);
    deleted += rows.length;
  }

  return { deleted };
}

export async function listLinkedinHistory(args: {
  user: SessionUser;
  page?: number;
  pageSize?: number;
  query?: string;
  remote?: boolean;
  green?: boolean;
  sortBy?: string;
  status?: string;
}) {
  const env = getCloudflareEnv();
  if (!env.DB) return { rows: [], total: 0, canViewAllUsers: false, statusCounts: {} };
  const db = getDb(env.DB);
  const settings = await getLinkedinSettings();
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const canViewAllUsers = settings.linkedinAllowAllUsersView;

  const q = args.query?.trim();
  // baseWhereClause excludes the status filter so statusCounts always reflect
  // the full pipeline distribution for the current search/filter context.
  const baseWhereClause = and(
    canViewAllUsers ? undefined : eq(linkedinJobResults.userId, args.user.id),
    q ? or(like(linkedinJobResults.title, `%${q}%`), like(linkedinJobResults.company, `%${q}%`)) : undefined,
    args.remote
      ? or(
          like(linkedinJobResults.workplaceType, "%remote%"),
          like(linkedinJobResults.location, "%remote%"),
          like(linkedinJobResults.snippet, "%remote%"),
          like(linkedinJobResults.title, "%remote%"),
        )
      : undefined,
    args.green ? gte(linkedinJobResults.masterScore, 80) : undefined,
  );
  const whereClause = args.status
    ? and(baseWhereClause, eq(linkedinJobResults.status, args.status))
    : baseWhereClause;

  const orderBy = (() => {
    switch (args.sortBy) {
      case "title":
        return [asc(linkedinJobResults.title)];
      case "score":
        return [desc(linkedinJobResults.masterScore), asc(linkedinJobResults.title)];
      case "company":
        return [asc(linkedinJobResults.company), asc(linkedinJobResults.title)];
      case "location":
        return [asc(linkedinJobResults.location), asc(linkedinJobResults.title)];
      default:
        return [desc(linkedinJobResults.lastSeenAt), desc(linkedinJobResults.masterScore)];
    }
  })();

  const rows = await db
    .select({
      id: linkedinJobResults.id,
      userId: linkedinJobResults.userId,
      savedSearchId: linkedinJobResults.savedSearchId,
      externalJobId: linkedinJobResults.externalJobId,
      title: linkedinJobResults.title,
      company: linkedinJobResults.company,
      location: linkedinJobResults.location,
      sourceUrl: linkedinJobResults.sourceUrl,
      canonicalSourceUrl: linkedinJobResults.canonicalSourceUrl,
      sourceName: linkedinJobResults.sourceName,
      searchUrl: linkedinJobResults.searchUrl,
      criteria: linkedinJobResults.criteria,
      salary: linkedinJobResults.salary,
      snippet: linkedinJobResults.snippet,
      description: linkedinJobResults.description,
      postDateText: linkedinJobResults.postDateText,
      workplaceType: linkedinJobResults.workplaceType,
      atsScore: linkedinJobResults.atsScore,
      careerScore: linkedinJobResults.careerScore,
      outlookScore: linkedinJobResults.outlookScore,
      masterScore: linkedinJobResults.masterScore,
      atsReason: linkedinJobResults.atsReason,
      careerReason: linkedinJobResults.careerReason,
      outlookReason: linkedinJobResults.outlookReason,
      isUnicorn: linkedinJobResults.isUnicorn,
      unicornReason: linkedinJobResults.unicornReason,
      status: linkedinJobResults.status,
      firstSeenAt: linkedinJobResults.firstSeenAt,
      lastSeenAt: linkedinJobResults.lastSeenAt,
      createdAt: linkedinJobResults.createdAt,
      updatedAt: linkedinJobResults.updatedAt,
      ownerEmail: sql<string | null>`${sql.raw(canViewAllUsers ? "(select email from users where users.id = linkedin_job_results.user_id)" : "null")}`,
    })
    .from(linkedinJobResults)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(linkedinJobResults)
    .where(whereClause);

  const statusRows = await db
    .select({
      status: linkedinJobResults.status,
      count: sql<number>`count(*)`,
    })
    .from(linkedinJobResults)
    .where(baseWhereClause)
    .groupBy(linkedinJobResults.status);

  const normalizedRows = rows.map((row) => ({
    ...row,
    status: normalizeLinkedinJobStatus(row.status),
  }));

  const normalizedStatusCounts = statusRows.reduce<Partial<Record<LinkedinJobStatus, number>>>(
    (counts, row) => {
      const status = normalizeLinkedinJobStatus(row.status);
      counts[status] = (counts[status] ?? 0) + Number(row.count ?? 0);
      return counts;
    },
    {},
  );

  return {
    rows: normalizedRows,
    total: Number(countRow?.count ?? 0),
    canViewAllUsers,
    statusCounts: normalizedStatusCounts,
  };
}

export async function pruneExpiredLinkedinJobResults() {
  const env = getCloudflareEnv();
  if (!env.DB) return 0;
  const db = getDb(env.DB);
  const settings = await getLinkedinSettings();
  if (!settings.linkedinAutoPrune) return 0;

  const cutoff = new Date(Date.now() - settings.linkedinRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({ id: linkedinJobResults.id })
    .from(linkedinJobResults)
    .where(lte(linkedinJobResults.lastSeenAt, cutoff));

  if (rows.length === 0) return 0;

  await db.delete(linkedinJobResults).where(lte(linkedinJobResults.lastSeenAt, cutoff));
  return rows.length;
}

export async function pruneDuplicateLinkedinJobResults() {
  const env = getCloudflareEnv();
  if (!env.DB) return 0;

  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(linkedinJobResults)
    .orderBy(
      desc(linkedinJobResults.lastSeenAt),
      desc(linkedinJobResults.masterScore),
      desc(linkedinJobResults.createdAt),
    );

  const duplicateIds: number[] = [];
  const keeperIdByCanonicalKey = new Map<string, number>();
  const canonicalByKeeperId = new Map<number, string>();

  for (const row of rows) {
    const canonicalSourceUrl = canonicalizeLinkedinJobUrl(row.sourceUrl, row.externalJobId);
    const dedupeKey = `${row.userId}:${canonicalSourceUrl}`;
    if (keeperIdByCanonicalKey.has(dedupeKey)) {
      duplicateIds.push(row.id);
      continue;
    }
    keeperIdByCanonicalKey.set(dedupeKey, row.id);
    canonicalByKeeperId.set(row.id, canonicalSourceUrl);
  }

  if (duplicateIds.length > 0) {
    for (const batch of chunkValues(duplicateIds, SQLITE_DELETE_BATCH_SIZE)) {
      await db.delete(linkedinJobResults).where(inArray(linkedinJobResults.id, batch));
    }
  }

  for (const [id, canonicalSourceUrl] of canonicalByKeeperId.entries()) {
    await db
      .update(linkedinJobResults)
      .set({
        canonicalSourceUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(linkedinJobResults.id, id));
  }
  return duplicateIds.length;
}

export async function pruneSemanticDuplicateLinkedinJobResults() {
  const env = getCloudflareEnv();
  if (!env.DB) return 0;

  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(linkedinJobResults)
    .orderBy(
      desc(linkedinJobResults.masterScore),
      desc(linkedinJobResults.lastSeenAt),
      desc(linkedinJobResults.createdAt),
    );

  const bestBySemanticKey = new Map<string, number>();
  const duplicateIds: number[] = [];

  for (const row of rows) {
    const semanticKey = `${row.userId}:${buildLinkedinJobSemanticKey({
      title: row.title,
      company: row.company,
      location: row.location,
    })}`;

    if (bestBySemanticKey.has(semanticKey)) {
      duplicateIds.push(row.id);
      continue;
    }

    bestBySemanticKey.set(semanticKey, row.id);
  }

  if (duplicateIds.length === 0) return 0;

  for (const batch of chunkValues(duplicateIds, SQLITE_DELETE_BATCH_SIZE)) {
    await db.delete(linkedinJobResults).where(inArray(linkedinJobResults.id, batch));
  }

  return duplicateIds.length;
}

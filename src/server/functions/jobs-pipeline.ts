'use server';

/**
 * Unified Pipeline Server Functions
 *
 * All pipeline operations (list, stage change, flag, bulk actions, search
 * agents) go through these TanStack Server Functions which call the
 * normalized-jobs-persistence layer operating on the `normalized_jobs` table.
 */

import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import type { PipelineStatus } from "@/lib/pipeline-constants";
import { getDb } from "@/db/db";
import { user as userTable, canonicalJobs, masterResume, normalizedJobs, jobSources } from "@/db/schema";
import { eq, and, inArray, or, gte, isNull, desc, asc, sql, count, ne } from "drizzle-orm";
import { scoreJobAgainstProfile } from "@/lib/ai/job-score";
import { canonicalizeJobUrl } from "@/lib/normalized-jobs-persistence";
import {
  listNormalizedJobs,
  setNormalizedJobStage,
  setNormalizedJobFlag,
  bulkUpdateNormalizedJobStage,
  bulkDeleteNormalizedJobs,
  listSearchConfigurations,
  deleteSearchConfiguration,
  setSearchConfigurationActive,
  getAgentSettings,
  getShowGlobalJobsForUser,
} from "@/lib/normalized-jobs-persistence";

// ─── Job History (unified) ───────────────────────────────────────────────────

export const getPipelineJobHistory = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      page?: number;
      pageSize?: number;
      query?: string;
      remote?: boolean;
      green?: boolean;
      sortBy?: string;
      status?: string;
      excludeFavorited?: boolean;
      includeGlobal?: boolean;
      isFavorited?: boolean;
    }) => data,
  )
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const includeGlobal = data.includeGlobal ?? (await getShowGlobalJobsForUser(user.id));
    return listNormalizedJobs({
      user,
      includeGlobal,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 20,
      query: data.query,
      remote: data.remote,
      green: data.green,
      sortBy: data.sortBy,
      status: data.status,
      excludeFavorited: data.excludeFavorited,
      isFavorited: data.isFavorited,
    });
  });

// ─── Stage / Flag Changes ─────────────────────────────────────────────────────

export const setPipelineJobStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: PipelineStatus }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return setNormalizedJobStage({ user, id: data.id, currentStage: data.status });
  });

export const setPipelineJobFlag = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isFlagged: boolean }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return setNormalizedJobFlag({ user, id: data.id, isFlagged: data.isFlagged });
  });

export const archivePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return bulkUpdateNormalizedJobStage({ user, ids: data.ids, currentStage: "Archived" });
  });

export const deletePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return bulkDeleteNormalizedJobs({ user, ids: data.ids });
  });

// ─── Saved Searches (Agents) ─────────────────────────────────────────────────

export const getSavedPipelineSearches = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  const user = await resolveSessionUser((ctx as any)?.request);
  if (!user) throw new Error("Not authenticated");
  return listSearchConfigurations(user.id);
});

export const getPipelineCronInfo = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  const user = await resolveSessionUser((ctx as any)?.request);
  if (!user) throw new Error("Not authenticated");
  const settings = await getAgentSettings();
  return {
    cronFrequency: settings.linkedinSearchCronFrequency,
    cronStartHour: settings.linkedinCronStartHour,
    cronVarianceMinutes: settings.linkedinCronVarianceMinutes,
  };
});

export const removeSearchAgent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    await deleteSearchConfiguration(data.id, user.id);
    return { success: true };
  });

export const toggleSearchAgentCron = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isActive: boolean }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    await setSearchConfigurationActive(data.id, user.id, data.isActive);
    return { success: true };
  });

export const setSearchAgentRunning = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isRunning: boolean }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.KV) return { success: false };
     const lockKey = `user:${user.id}:agent:${data.id}:running`;
    if (data.isRunning) {
      await env.KV.put(lockKey, "true", { expirationTtl: 300 });
    } else {
      await env.KV.delete(lockKey);
    }
    return { success: true };
  });

export const getRecommendedJobs = createServerFn({ method: "GET" })
  .handler(async (ctx: any) => {
    const sessionUser = await resolveSessionUser((ctx as any)?.request);
    if (!sessionUser) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) return { jobs: [] };
    const db = getDb(env.DB);

    // 1. Fetch user preferences and resume
    const [userRow] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, sessionUser.id))
      .limit(1);

    if (!userRow) throw new Error("User not found");

    const resumeRows = await db
      .select({ rawText: masterResume.rawText })
      .from(masterResume)
      .where(eq(masterResume.userId, sessionUser.id))
      .limit(1);
    const resumeText = resumeRows[0]?.rawText || '';

    // 2. Fetch candidates from Vectorize using resume embedding
    let candidateIds: string[] = [];
    if (env.VECTORIZE && env.AI && resumeText) {
      try {
        const response = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
          text: [resumeText.substring(0, 1000)]
        }) as any;
        const vector = response?.data?.[0];
        if (vector) {
          const results = await env.VECTORIZE.query(vector, {
            returnMetadata: 'all',
            returnValues: false,
            topK: 50,
          });
          if (results?.matches) {
            candidateIds = results.matches
              .filter((m: any) => !m.id.includes('#'))
              .map((m: any) => m.id);
          }
        }
      } catch (err) {
        console.error("[getRecommendedJobs] Vectorize query failed:", err);
      }
    }

    // 3. If Vectorize returned no candidates, return empty — don't fall back to arbitrary jobs
    if (candidateIds.length === 0) {
      return { jobs: [] };
    }

    // Query canonical_jobs matching vector-matched IDs and user filters
    const whereConditions: any[] = [
      eq(canonicalJobs.isListed, true),
      inArray(canonicalJobs.id, candidateIds),
    ];

    // Apply remote preference
    if (userRow.preferredRemote === 'remote') {
      whereConditions.push(eq(canonicalJobs.remote, true));
    } else if (userRow.preferredRemote === 'on-site') {
      whereConditions.push(eq(canonicalJobs.remote, false));
    }

    // Apply salary preference
    if (userRow.preferredSalaryMin) {
      whereConditions.push(
        or(
          isNull(canonicalJobs.compensationMax),
          gte(canonicalJobs.compensationMax, userRow.preferredSalaryMin)
        )
      );
    }

    // Fetch matched canonical jobs
    const matchedJobs = await db
      .select()
      .from(canonicalJobs)
      .where(and(...whereConditions))
      .orderBy(canonicalJobs.lastSeenAt)
      .limit(6);

    const resultJobs: any[] = [];
    const now = new Date().toISOString();

    for (const job of matchedJobs) {
      // 1. Fetch sourceUrl from jobSources first
      const [sourceRow] = await db
        .select({ sourceUrl: jobSources.sourceUrl, ats: jobSources.ats })
        .from(jobSources)
        .where(eq(jobSources.canonicalId, job.id))
        .limit(1);

      const sourceUrl = sourceRow?.sourceUrl || `https://caliber.internal/jobs/canonical/${job.id}`;
      const sourceOrigin = sourceRow?.ats || 'unknown';
      const canonicalUrl = canonicalizeJobUrl(sourceUrl);

      // 2. Check if user already has a normalized_jobs row for this canonical job or URL
      let [existing] = await db
        .select()
        .from(normalizedJobs)
        .where(
          and(
            eq(normalizedJobs.userId, sessionUser.id),
            or(
              eq(normalizedJobs.canonicalJobId, job.id),
              eq(normalizedJobs.canonicalSourceUrl, canonicalUrl)
            )
          )
        )
        .limit(1);

      let item: any;

      if (existing) {
        if (existing.canonicalJobId !== job.id) {
          await db
            .update(normalizedJobs)
            .set({ canonicalJobId: job.id })
            .where(eq(normalizedJobs.id, existing.id));
          existing.canonicalJobId = job.id;
        }

        // If it exists but doesn't have a quickAnalysis yet, run AI synthesis
        if (!existing.quickAnalysis && resumeText) {
          try {
            const scores = await scoreJobAgainstProfile(env.AI, resumeText, {
              id: job.id,
              title: job.titleDisplay,
              description: job.descriptionPlain || '',
            });
            await db
              .update(normalizedJobs)
              .set({
                quickAnalysis: scores.quickAnalysis,
                isUnicorn: scores.isUnicorn ? 1 : 0,
                unicornReason: scores.unicornReason,
                atsScore: scores.atsScore,
                careerScore: scores.careerScore,
                outlookScore: scores.outlookScore,
                masterScore: scores.masterScore,
                atsReason: scores.atsReason,
                careerReason: scores.careerReason,
                outlookReason: scores.outlookReason,
                updatedAt: now,
              })
              .where(eq(normalizedJobs.id, existing.id));
            
            existing.quickAnalysis = scores.quickAnalysis;
            existing.isUnicorn = scores.isUnicorn ? 1 : 0;
            existing.unicornReason = scores.unicornReason;
            existing.atsScore = scores.atsScore;
            existing.careerScore = scores.careerScore;
            existing.outlookScore = scores.outlookScore;
            existing.masterScore = scores.masterScore;
            existing.atsReason = scores.atsReason;
            existing.careerReason = scores.careerReason;
            existing.outlookReason = scores.outlookReason;
          } catch (scoreErr) {
            console.error("[getRecommendedJobs] scoring existing failed:", scoreErr);
          }
        }

        item = {
          ...existing,
          id: existing.id,
          canonicalJobId: job.id,
          title: existing.jobTitle,
          company: existing.employerName,
          location: existing.location,
        };
      } else {
        // Run lightweight scoring
        let scores = {
          atsScore: 50,
          careerScore: 50,
          outlookScore: 50,
          masterScore: 50,
          atsReason: 'Awaiting evaluation.',
          careerReason: 'Awaiting evaluation.',
          outlookReason: 'Awaiting evaluation.',
          isUnicorn: false,
          unicornReason: null as string | null,
          quickAnalysis: null as string | null,
        };

        if (resumeText) {
          try {
            scores = await scoreJobAgainstProfile(env.AI, resumeText, {
              id: job.id,
              title: job.titleDisplay,
              description: job.descriptionPlain || '',
            });
          } catch (scoreErr) {
            console.error("[getRecommendedJobs] scoring failed:", scoreErr);
          }
        }

        // Insert into normalizedJobs as recommendation (unstarred — user must explicitly favorite)
        const [inserted] = await db
          .insert(normalizedJobs)
          .values({
            userId: sessionUser.id,
            canonicalJobId: job.id,
            isFavorited: false,
            sourceOrigin,
            jobTitle: job.titleDisplay,
            employerName: job.companyDisplay,
            location: job.locationDisplay || null,
            sourceUrl,
            canonicalSourceUrl: canonicalUrl,
            description: job.descriptionPlain || null,
            snippet: job.descriptionPlain ? job.descriptionPlain.substring(0, 300) : null,
            salary: job.compensationMin || job.compensationMax
              ? [job.compensationMin, job.compensationMax].filter(v => v != null).map(v => `$${v.toLocaleString()}`).join(' - ')
              : null,
            workplaceType: job.remote ? 'remote' : 'on-site',
            remoteType: job.remote ? 'fully_remote' : 'unspecified',
            currentStage: 'Favorited',
            isFlagged: false,
            isUnicorn: scores.isUnicorn ? 1 : 0,
            unicornReason: scores.unicornReason,
            quickAnalysis: scores.quickAnalysis,
            atsScore: scores.atsScore,
            careerScore: scores.careerScore,
            outlookScore: scores.outlookScore,
            masterScore: scores.masterScore,
            atsReason: scores.atsReason,
            careerReason: scores.careerReason,
            outlookReason: scores.outlookReason,
            discoveryTimestamp: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        item = {
          ...inserted,
          title: job.titleDisplay,
          company: job.companyDisplay,
          location: job.locationDisplay,
        };
      }

      resultJobs.push({
        ...item,
        isFavorited: item.isFavorited === 1 || item.isFavorited === true,
      });
    }

    return { jobs: resultJobs };
  });

export const togglePipelineJobFavorite = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isFavorited: boolean }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    const [existing] = await db
      .select({ currentStage: normalizedJobs.currentStage })
      .from(normalizedJobs)
      .where(and(eq(normalizedJobs.id, data.id), eq(normalizedJobs.userId, user.id)))
      .limit(1);

    if (!data.isFavorited && existing && existing.currentStage === 'Favorited') {
      await db
        .delete(normalizedJobs)
        .where(and(eq(normalizedJobs.id, data.id), eq(normalizedJobs.userId, user.id)));
      return { success: true, id: data.id, isFavorited: false, deleted: true };
    }

    const update: Record<string, unknown> = { isFavorited: data.isFavorited };
    if (data.isFavorited) {
      update.currentStage = 'Favorited';
    }
    await db
      .update(normalizedJobs)
      .set(update as any)
      .where(and(eq(normalizedJobs.id, data.id), eq(normalizedJobs.userId, user.id)));
    return { success: true, id: data.id, isFavorited: data.isFavorited };
  });

// ─── Catalog Browser ──────────────────────────────────────────────────────────

// Diagnostic endpoint to check catalog state
export const getCatalogStats = createServerFn({ method: "GET" })
  .inputValidator((data: {}) => data)
  .handler(async (ctx: any) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) return { error: "Database unavailable" };
    const db = getDb(env.DB);

    try {
      // Count total canonical jobs
      const totalJobs = await db
        .select({ count: count() })
        .from(canonicalJobs)
        .where(eq(canonicalJobs.isListed, true));

      // Count jobs with titles and companies normalized
      const normalizedJobs = await db
        .select({ count: count() })
        .from(canonicalJobs)
        .where(and(
          eq(canonicalJobs.isListed, true),
          sql`${canonicalJobs.titleNorm} IS NOT NULL AND ${canonicalJobs.titleNorm} != ''`,
          sql`${canonicalJobs.companyNorm} IS NOT NULL AND ${canonicalJobs.companyNorm} != ''`
        ));

      // Check if Vectorize is available
      const vectorizeAvailable = !!env.VECTORIZE;
      const aiAvailable = !!env.AI;

      return {
        totalListedJobs: totalJobs[0]?.count || 0,
        normalizedJobs: normalizedJobs[0]?.count || 0,
        vectorizeAvailable,
        aiAvailable,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  });

export const getCatalogJobs = createServerFn({ method: "GET" })
  .inputValidator((data: {
    query?: string;
    remote?: boolean;
    company?: string;
    ats?: string;
    salaryMin?: number;
    page?: number;
    pageSize?: number;
    useVectorSearch?: boolean;
  }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) return { jobs: [], total: 0, page: 1, pageSize: 20 };
    const db = getDb(env.DB);

    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // Build where conditions for canonical_jobs
    const conditions: any[] = [eq(canonicalJobs.isListed, true)];

    // Try vector search first if enabled and query exists
    const VECTOR_SCORE_THRESHOLD = 0.30; // minimum cosine similarity to include a result
    let vectorSearchAttempted = false;
    let vectorJobIds: string[] | null = null;
    let vectorScoreMap = new Map<string, number>(); // id → cosine score for re-ranking
    if (data.useVectorSearch && data.query?.trim() && env.VECTORIZE && env.AI) {
      try {
        vectorSearchAttempted = true;
        const { embedJob } = await import('@/server/dedup/embedding');
        // Compose a richer embedding text than just the raw query title
        const embeddingText = `${data.query.trim()} job position`;
        const queryVector = await embedJob(env, {
          titleDisplay: embeddingText,
          companyDisplay: '',
          titleNorm: '',
          companyNorm: '',
          remote: false,
          dedupKey: '',
          rawHash: '',
        });

        const results = await env.VECTORIZE.query(queryVector, {
          returnMetadata: 'all',
          returnValues: false,
          topK: 50,
        });

        // Log top matches for tuning
        const topMatches = (results.matches || []).slice(0, 5);
        console.log('[getCatalogJobs] Vector top-5 matches:', topMatches.map(m => ({
          id: String(m.metadata?.canonical_id || m.id),
          score: m.score,
        })));

        // Apply minimum score threshold
        const aboveThreshold = (results.matches || []).filter(m => m.score >= VECTOR_SCORE_THRESHOLD);
        console.log(`[getCatalogJobs] Vector matches above threshold (${VECTOR_SCORE_THRESHOLD}): ${aboveThreshold.length} of ${results.matches?.length ?? 0}`);

        vectorJobIds = aboveThreshold.map(m => String(m.metadata?.canonical_id || m.id));
        aboveThreshold.forEach(m => {
          vectorScoreMap.set(String(m.metadata?.canonical_id || m.id), m.score);
        });

        if (vectorJobIds.length > 0) {
          conditions.push(inArray(canonicalJobs.id, vectorJobIds));
          console.log('[getCatalogJobs] Vector search found', vectorJobIds.length, 'results');
        } else {
          console.warn('[getCatalogJobs] Vector search returned 0 results above threshold, falling back to keyword search');
          vectorJobIds = null;
        }
      } catch (error) {
        console.warn('[getCatalogJobs] Vector search failed, falling back to keyword search:', error);
        vectorJobIds = null;
      }
    }

    // Fall back to keyword search if vector search wasn't attempted, didn't find results, or failed
    if (vectorJobIds === null && data.query?.trim()) {
      const q = data.query.trim().toLowerCase();
      // Use instr for SQLite substring matching (case-insensitive)
      conditions.push(or(
        sql`instr(${canonicalJobs.titleNorm}, ${q}) > 0`,
        sql`instr(${canonicalJobs.companyNorm}, ${q}) > 0`,
      ));
      if (!vectorSearchAttempted) {
        console.log('[getCatalogJobs] Using keyword search for query:', q);
      }
    }
    if (data.remote === true) conditions.push(eq(canonicalJobs.remote, true));
    if (data.remote === false) conditions.push(eq(canonicalJobs.remote, false));
    if (data.company?.trim()) {
      const companyQ = data.company.trim().toLowerCase();
      conditions.push(sql`instr(${canonicalJobs.companyNorm}, ${companyQ}) > 0`);
    }
    if (data.salaryMin) {
      conditions.push(or(
        isNull(canonicalJobs.compensationMax),
        gte(canonicalJobs.compensationMax, data.salaryMin),
      ));
    }

    // ATS filter — join job_sources
    const atsFilter = data.ats?.trim();

    // Count total — use DISTINCT to avoid counting duplicates from LEFT JOINs
    // Exclude jobs that are archived (either for this user or globally)
    const countRows = await db
      .select({ total: count(canonicalJobs.id, { distinct: true }) })
      .from(canonicalJobs)
      .leftJoin(jobSources, eq(jobSources.canonicalId, canonicalJobs.id))
      .leftJoin(normalizedJobs, and(
        eq(normalizedJobs.canonicalJobId, canonicalJobs.id),
        or(
          eq(normalizedJobs.userId, user.id),
          isNull(normalizedJobs.userId)
        )
      ))
      .where(and(
        ...conditions,
        atsFilter ? eq(jobSources.ats, atsFilter) : undefined,
        or(
          isNull(normalizedJobs.currentStage),
          ne(normalizedJobs.currentStage, 'Archived')
        )
      ));
    const total = Number(countRows[0]?.total ?? 0);

    // Debug logging
    console.log('[getCatalogJobs] Search attempt:', {
      query: data.query?.trim() || 'none',
      total,
      vectorSearchAttempted,
      vectorJobIds: vectorJobIds?.length || 0,
      conditionsCount: conditions.length,
      isListed: true,
    });

    // Fetch page — get only distinct canonical jobs by using a subquery
    // This avoids the LEFT JOIN duplication issue
    // Include both user-specific and global (userId = NULL) normalized_jobs entries
    const jobIds = await db
      .selectDistinct({ id: canonicalJobs.id })
      .from(canonicalJobs)
      .leftJoin(jobSources, eq(jobSources.canonicalId, canonicalJobs.id))
      .leftJoin(normalizedJobs, and(
        eq(normalizedJobs.canonicalJobId, canonicalJobs.id),
        or(
          eq(normalizedJobs.userId, user.id),
          isNull(normalizedJobs.userId)
        )
      ))
      .where(and(
        ...conditions,
        atsFilter ? eq(jobSources.ats, atsFilter) : undefined,
        or(
          isNull(normalizedJobs.currentStage),
          ne(normalizedJobs.currentStage, 'Archived')
        )
      ))
      .orderBy(desc(canonicalJobs.lastSeenAt))
      .limit(pageSize)
      .offset(offset);

    const rows = await db
      .select({
        id: canonicalJobs.id,
        titleDisplay: canonicalJobs.titleDisplay,
        companyDisplay: canonicalJobs.companyDisplay,
        locationDisplay: canonicalJobs.locationDisplay,
        remote: canonicalJobs.remote,
        employmentType: canonicalJobs.employmentType,
        experienceLevel: canonicalJobs.experienceLevel,
        compensationMin: canonicalJobs.compensationMin,
        compensationMax: canonicalJobs.compensationMax,
        compensationCurrency: canonicalJobs.compensationCurrency,
        firstSeenAt: canonicalJobs.firstSeenAt,
        lastSeenAt: canonicalJobs.lastSeenAt,
        descriptionPlain: canonicalJobs.descriptionPlain,
        ats: jobSources.ats,
        sourceUrl: jobSources.sourceUrl,
        applyUrl: jobSources.applyUrl,
        sourceCreatedAt: jobSources.createdAt,
        isFavorited: normalizedJobs.isFavorited,
        currentStage: normalizedJobs.currentStage,
      })
      .from(canonicalJobs)
      .leftJoin(jobSources, eq(jobSources.canonicalId, canonicalJobs.id))
      .leftJoin(normalizedJobs, and(
        eq(normalizedJobs.canonicalJobId, canonicalJobs.id),
        or(
          eq(normalizedJobs.userId, user.id),
          isNull(normalizedJobs.userId)
        )
      ))
      .where(inArray(canonicalJobs.id, jobIds.map(j => j.id)));

    // Deduplicate by canonical job ID — keep first source per job
    const seenIds = new Set<string>();
    const uniqueRows = rows.filter((r) => {
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });

    // Weighted hybrid re-rank: blend vector cosine score + keyword presence
    const q = (data.query || '').trim().toLowerCase();
    const scoredRows = uniqueRows.map((r) => {
      const vectorScore = vectorScoreMap.get(r.id) ?? 0;
      const keywordMatch =
        q && (
          r.titleDisplay?.toLowerCase().includes(q) ||
          r.companyDisplay?.toLowerCase().includes(q)
        ) ? 1 : 0;
      const finalScore = vectorScore > 0
        ? 0.7 * vectorScore + 0.3 * keywordMatch
        : keywordMatch * 0.3; // keyword-only fallback gets lower weight
      return { row: r, finalScore };
    });

    if (vectorScoreMap.size > 0) {
      scoredRows.sort((a, b) => b.finalScore - a.finalScore);
    }

    const jobs = scoredRows.map(({ row: r }) => ({
      ...r,
      isSaved: r.currentStage !== null && r.currentStage !== undefined,
      isFavorited: r.isFavorited === true || r.isFavorited === 1,
    }));

    return { jobs, total, page, pageSize };
  });

export const starCatalogJob = createServerFn({ method: "POST" })
  .inputValidator((data: { canonicalJobId: string; star: boolean }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    // Find the canonical job
    const [canonical] = await db
      .select()
      .from(canonicalJobs)
      .where(eq(canonicalJobs.id, data.canonicalJobId))
      .limit(1);
    if (!canonical) throw new Error("Job not found");

    // Get source URL
    const [source] = await db
      .select({ sourceUrl: jobSources.sourceUrl, ats: jobSources.ats })
      .from(jobSources)
      .where(eq(jobSources.canonicalId, canonical.id))
      .limit(1);

    const sourceUrl = source?.sourceUrl ?? `https://caliber.internal/jobs/canonical/${canonical.id}`;
    const canonicalUrl = canonicalizeJobUrl(sourceUrl);
    const now = new Date().toISOString();

    // Upsert into normalized_jobs
    const [existing] = await db
      .select({ id: normalizedJobs.id })
      .from(normalizedJobs)
      .where(and(
        eq(normalizedJobs.userId, user.id),
        or(
          eq(normalizedJobs.canonicalJobId, canonical.id),
          eq(normalizedJobs.canonicalSourceUrl, canonicalUrl),
        ),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(normalizedJobs)
        .set({ isFavorited: data.star, updatedAt: now })
        .where(eq(normalizedJobs.id, existing.id));
      return { success: true, id: existing.id, isFavorited: data.star };
    }

    // Insert new row
    const [inserted] = await db
      .insert(normalizedJobs)
      .values({
        userId: user.id,
        canonicalJobId: canonical.id,
        isFavorited: data.star,
        currentStage: 'Favorited',
        sourceOrigin: source?.ats ?? 'unknown',
        jobTitle: canonical.titleDisplay,
        employerName: canonical.companyDisplay,
        location: canonical.locationDisplay ?? null,
        sourceUrl,
        canonicalSourceUrl: canonicalUrl,
        description: canonical.descriptionPlain ?? null,
        snippet: canonical.descriptionPlain ? canonical.descriptionPlain.substring(0, 300) : null,
        isFlagged: false,
        remoteType: canonical.remote ? 'fully_remote' : 'unspecified',
        workplaceType: canonical.remote ? 'remote' : 'on-site',
        discoveryTimestamp: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return { success: true, id: inserted.id, isFavorited: data.star };
  });

export const checkNewJobsSince = createServerFn({ method: "GET" })
  .inputValidator((data: { since: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) return { crawlerJobsCount: 0, agentJobsCount: 0 };
    const db = getDb(env.DB);

    // 1. Crawler jobs: canonicalJobs added since 'since'
    const crawlerRows = await db
      .select({ count: count() })
      .from(canonicalJobs)
      .where(gte(canonicalJobs.createdAt, data.since));
    const crawlerJobsCount = Number(crawlerRows[0]?.count ?? 0);

    // 2. User defined search agent jobs: normalizedJobs added since 'since' for this user
    const agentRows = await db
      .select({ count: count() })
      .from(normalizedJobs)
      .where(and(
        eq(normalizedJobs.userId, user.id),
        gte(normalizedJobs.createdAt, data.since),
        sql`${normalizedJobs.savedSearchId} IS NOT NULL`
      ));
    const agentJobsCount = Number(agentRows[0]?.count ?? 0);

    return { crawlerJobsCount, agentJobsCount };
  });

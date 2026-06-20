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
import { eq, and, inArray, or, gte, isNull, like } from "drizzle-orm";
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
      excludeDiscovered?: boolean;
      includeGlobal?: boolean;
      isFavorited?: boolean;
    }) => data,
  )
  .handler(async ({ data }, ctx) => {
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
      excludeDiscovered: data.excludeDiscovered,
      isFavorited: data.isFavorited,
    });
  });

// ─── Stage / Flag Changes ─────────────────────────────────────────────────────

export const setPipelineJobStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: PipelineStatus }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return setNormalizedJobStage({ user, id: data.id, currentStage: data.status });
  });

export const setPipelineJobFlag = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isFlagged: boolean }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return setNormalizedJobFlag({ user, id: data.id, isFlagged: data.isFlagged });
  });

export const archivePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return bulkUpdateNormalizedJobStage({ user, ids: data.ids, currentStage: "Archived" });
  });

export const deletePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    return bulkDeleteNormalizedJobs({ user, ids: data.ids });
  });

// ─── Saved Searches (Agents) ─────────────────────────────────────────────────

export const getSavedPipelineSearches = createServerFn({ method: "GET" }).handler(async (_data, ctx) => {
  const user = await resolveSessionUser((ctx as any)?.request);
  if (!user) throw new Error("Not authenticated");
  return listSearchConfigurations(user.id);
});

export const getPipelineCronInfo = createServerFn({ method: "GET" }).handler(async (_data, ctx) => {
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
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    await deleteSearchConfiguration(data.id, user.id);
    return { success: true };
  });

export const toggleSearchAgentCron = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isActive: boolean }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    await setSearchConfigurationActive(data.id, user.id, data.isActive);
    return { success: true };
  });

export const setSearchAgentRunning = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isRunning: boolean }) => data)
  .handler(async ({ data }, ctx) => {
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
  .handler(async (_data, ctx) => {
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
        });
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

    // 3. Query canonical_jobs matching user filters
    const whereConditions: any[] = [eq(canonicalJobs.isListed, true)];
    
    if (candidateIds.length > 0) {
      whereConditions.push(inArray(canonicalJobs.id, candidateIds));
    }

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
      .limit(20);

    const resultJobs: any[] = [];
    const now = new Date().toISOString();

    for (const job of matchedJobs) {
      // Check if user already has a normalized_jobs row for this canonical job
      let [existing] = await db
        .select()
        .from(normalizedJobs)
        .where(
          and(
            eq(normalizedJobs.userId, sessionUser.id),
            eq(normalizedJobs.canonicalJobId, job.id)
          )
        )
        .limit(1);

      let item: any;

      if (existing) {
        item = {
          ...existing,
          id: existing.id,
          canonicalJobId: job.id,
          title: job.jobTitle,
          company: job.employerName,
          location: job.location,
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

        // Fetch sourceUrl from jobSources
        const [sourceRow] = await db
          .select({ sourceUrl: jobSources.sourceUrl, ats: jobSources.ats })
          .from(jobSources)
          .where(eq(jobSources.canonicalId, job.id))
          .limit(1);

        const sourceUrl = sourceRow?.sourceUrl || '';
        const sourceOrigin = sourceRow?.ats || 'unknown';

        // Insert into normalizedJobs as recommendation (isFavorited = false)
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
            canonicalSourceUrl: canonicalizeJobUrl(sourceUrl),
            description: job.descriptionPlain || null,
            snippet: job.descriptionPlain ? job.descriptionPlain.substring(0, 300) : null,
            salary: job.compensationMin || job.compensationMax
              ? [job.compensationMin, job.compensationMax].filter(v => v != null).map(v => `$${v.toLocaleString()}`).join(' - ')
              : null,
            workplaceType: job.remote ? 'remote' : 'on-site',
            remoteType: job.remote ? 'fully_remote' : 'unspecified',
            currentStage: 'Discovered',
            isFlagged: false,
            isUnicorn: scores.isUnicorn ? 1 : 0,
            unicornReason: scores.unicornReason,
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
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);
    await db
      .update(normalizedJobs)
      .set({ isFavorited: data.isFavorited ? 1 : 0 })
      .where(and(eq(normalizedJobs.id, data.id), eq(normalizedJobs.userId, user.id)));
    return { success: true, id: data.id, isFavorited: data.isFavorited };
  });

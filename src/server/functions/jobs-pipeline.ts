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
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { PipelineStatus } from "@/lib/pipeline-constants";
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
    const env = getCloudflareEnv();
    if (!env.KV) return { success: false };
    const lockKey = `user:${user.id}:agent:${data.id}:running`;
    if (data.isRunning) {
      await env.KV.put(lockKey, "true", { expirationTtl: 300 });
    } else {
      await env.KV.delete(lockKey);
    }
    return { success: true };
  });

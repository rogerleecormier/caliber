'use server';

/**
 * Unified Pipeline Server Functions
 *
 * All pipeline operations (list, status change, bulk actions, search agents)
 * go through these TanStack Server Functions which call the unified
 * pipeline-persistence layer operating on the `pipeline_jobs` table.
 */

import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import type { PipelineStatus } from "@/lib/pipeline-constants";
import {
  listPipelineJobs,
  updatePipelineJobStatus,
  bulkUpdatePipelineJobStatus,
  bulkDeletePipelineJobs,
  listSavedSearches,
  getPipelineSettings,
} from "@/lib/pipeline-persistence";

// ─── Pipeline Job History (unified) ──────────────────────────────────────────

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
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return listPipelineJobs({
      user,
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

// ─── Status Changes ──────────────────────────────────────────────────────────

export const setPipelineJobStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: PipelineStatus }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return updatePipelineJobStatus({ user, id: data.id, status: data.status });
  });

export const archivePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return bulkUpdatePipelineJobStatus({ user, ids: data.ids, status: "Archived" });
  });

export const deletePipelineJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return bulkDeletePipelineJobs({ user, ids: data.ids });
  });

// ─── Saved Searches (Agents) ─────────────────────────────────────────────────

export const getSavedPipelineSearches = createServerFn({ method: "GET" }).handler(async () => {
  const user = await resolveSessionUser();
  if (!user) throw new Error("Not authenticated");
  return listSavedSearches(user.id);
});

export const getPipelineCronInfo = createServerFn({ method: "GET" }).handler(async () => {
  const user = await resolveSessionUser();
  if (!user) throw new Error("Not authenticated");
  const settings = await getPipelineSettings();
  return {
    cronFrequency: settings.linkedinSearchCronFrequency,
    cronStartHour: settings.linkedinCronStartHour,
    cronVarianceMinutes: settings.linkedinCronVarianceMinutes,
  };
});

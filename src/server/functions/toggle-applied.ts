'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { pipelineJobs } from "@/db/schema";
import { type PipelineStatus, PIPELINE_STATUSES, normalizePipelineStatus } from "@/lib/pipeline-constants";

export type ApplicationOutcome = PipelineStatus | null;

export const toggleApplied = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; applied: boolean }) => data)
  .handler(async ({ data }, ctx) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);
    const newStatus: PipelineStatus = data.applied ? 'Applied' : 'Analyzed';

    const [updated] = await db
      .update(pipelineJobs)
      .set({ status: newStatus, updatedAt: new Date().toISOString() })
      .where(and(eq(pipelineJobs.id, data.id), eq(pipelineJobs.userId, user.id)))
      .returning();

    if (!updated) throw new Error("Not found or not authorized");

    const status = normalizePipelineStatus(updated.status);
    return {
      id: updated.id,
      applied: ['Applied', 'Interviewed', 'Hired'].includes(status),
      appliedAt: null,
    };
  });

export const setApplicationOutcome = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: PipelineStatus | null }) => data)
  .handler(async ({ data }, ctx) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");

    if (data.status !== null && !PIPELINE_STATUSES.includes(data.status)) {
      throw new Error("Invalid pipeline status");
    }

    const db = getDb(env.DB);
    const newStatus: PipelineStatus = data.status ?? 'Analyzed';

    const [updated] = await db
      .update(pipelineJobs)
      .set({
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(pipelineJobs.id, data.id), eq(pipelineJobs.userId, user.id)))
      .returning();

    if (!updated) throw new Error("Not found or not authorized");

    const status = normalizePipelineStatus(updated.status);
    return {
      id: updated.id,
      applied: ['Applied', 'Interviewed', 'Hired'].includes(status),
      applicationStatus: status,
      appliedAt: null,
    };
  });

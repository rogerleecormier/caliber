'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb, schema } from "@/db/db";
import { resolveSessionUser } from "@/lib/resolve-user";

export type UserJobStatus = "Analyzed" | "Prepped" | "Applied" | "Interviewed" | "Hired" | "Archived";
export const USER_JOB_STATUSES: UserJobStatus[] = [
  "Analyzed", "Prepped", "Applied", "Interviewed", "Hired", "Archived",
];

function requireDb() {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database not available");
  return getDb(env.DB);
}

// Advance a job through the application pipeline.
export const updateUserJobStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { jobId: number; status: UserJobStatus }) => data)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    if (!USER_JOB_STATUSES.includes(data.status)) throw new Error("Invalid status");
    const db = requireDb();
    await db
      .update(schema.userJobs)
      .set({ status: data.status, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.userJobs.userId, user.id), eq(schema.userJobs.jobId, data.jobId)));
    return { success: true };
  });

// Bulk archive (sets status=Archived, removes from favorites listing).
export const archiveUserJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { jobIds: number[] }) => data)
  .handler(async ({ data }): Promise<{ success: boolean; count: number }> => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    if (data.jobIds.length === 0) return { success: true, count: 0 };
    const db = requireDb();
    await db
      .update(schema.userJobs)
      .set({ status: "Archived", favorited: false, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.userJobs.userId, user.id), inArray(schema.userJobs.jobId, data.jobIds)));
    return { success: true, count: data.jobIds.length };
  });

// Bulk delete the per-user relationship (canonical job stays in the DB).
export const deleteUserJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { jobIds: number[] }) => data)
  .handler(async ({ data }): Promise<{ success: boolean; count: number }> => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    if (data.jobIds.length === 0) return { success: true, count: 0 };
    const db = requireDb();
    await db
      .delete(schema.userJobs)
      .where(and(eq(schema.userJobs.userId, user.id), inArray(schema.userJobs.jobId, data.jobIds)));
    return { success: true, count: data.jobIds.length };
  });

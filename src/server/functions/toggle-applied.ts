'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { jobAnalyses } from "@/db/schema";

export type ApplicationOutcome = "Applied" | "Interviewed" | "Hired" | null;

export const toggleApplied = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; applied: boolean }) => data)
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);
    const now = data.applied ? new Date().toISOString() : null;

    const [updated] = await db
      .update(jobAnalyses)
      .set({ applied: data.applied ? 1 : 0, appliedAt: now })
      .where(and(eq(jobAnalyses.id, data.id), eq(jobAnalyses.userId, user.id)))
      .returning();

    if (!updated) throw new Error("Not found or not authorized");

    return {
      id: updated.id,
      applied: updated.applied === 1,
      appliedAt: updated.appliedAt ?? null,
    };
  });

export const setApplicationOutcome = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: ApplicationOutcome }) => data)
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    if (
      data.status !== null &&
      data.status !== "Applied" &&
      data.status !== "Interviewed" &&
      data.status !== "Hired"
    ) {
      throw new Error("Invalid application status");
    }

    const db = getDb(env.DB);
    const now = data.status ? new Date().toISOString() : null;

    const [updated] = await db
      .update(jobAnalyses)
      .set({
        applicationStatus: data.status,
        applied: data.status ? 1 : 0,
        appliedAt: now,
      })
      .where(and(eq(jobAnalyses.id, data.id), eq(jobAnalyses.userId, user.id)))
      .returning();

    if (!updated) throw new Error("Not found or not authorized");

    return {
      id: updated.id,
      applied: updated.applied === 1,
      applicationStatus:
        updated.applicationStatus === "Applied" ||
        updated.applicationStatus === "Interviewed" ||
        updated.applicationStatus === "Hired"
          ? updated.applicationStatus
          : null,
      appliedAt: updated.appliedAt ?? null,
    };
  });

'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getAuthInstance } from "@/server/auth";
import {
  user as userTable,
  masterResume,
  jobAnalyses,
  analyticsSummary,
  generatedDocuments,
  normalizedJobs,
  searchConfigurations,
} from "@/db/schema";

async function requireAdmin(ctx?: any) {
  const request = ctx?.request;
  const user = await resolveSessionUser(request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const listUsers = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  await requireAdmin(ctx);
  const env = await getCloudflareEnvAsync();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  return db.select({ id: userTable.id, email: userTable.email, role: userTable.role, createdAt: userTable.createdAt }).from(userTable);
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string; role?: "admin" | "user" }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const auth = getAuthInstance(env);

    // Call better-auth programmatic API to create the user and credential
    await auth.api.createUser({
      body: {
        email: data.email.trim().toLowerCase(),
        password: data.password,
        name: data.email.split("@")[0],
        role: data.role ?? "user",
      },
    });

    return { success: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const currentUser = await requireAdmin(ctx);
    if (currentUser.id === data.userId) throw new Error("You cannot delete your own admin account");

    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    // 1. Gather job analyses and pipeline jobs to clean up generated documents
    const userAnalyses = await db
      .select({ id: jobAnalyses.id })
      .from(jobAnalyses)
      .where(eq(jobAnalyses.userId, data.userId));
    const analysisIds = userAnalyses.map((a) => a.id);

    const userNormalizedJobs = await db
      .select({ id: normalizedJobs.id })
      .from(normalizedJobs)
      .where(eq(normalizedJobs.userId, data.userId));
    const normalizedJobIds = userNormalizedJobs.map((j) => j.id);

    // 2. Delete generated documents first (child of job_analyses and normalized_jobs)
    if (analysisIds.length > 0) {
      await db.delete(generatedDocuments).where(inArray(generatedDocuments.jobAnalysisId, analysisIds));
    }
    if (normalizedJobIds.length > 0) {
      await db.delete(generatedDocuments).where(inArray(generatedDocuments.pipelineJobId, normalizedJobIds));
    }

    // 3. Delete other child tables referencing users or saved searches
    await db.delete(normalizedJobs).where(eq(normalizedJobs.userId, data.userId));
    await db.delete(masterResume).where(eq(masterResume.userId, data.userId));
    await db.delete(jobAnalyses).where(eq(jobAnalyses.userId, data.userId));
    await db.delete(analyticsSummary).where(eq(analyticsSummary.userId, data.userId));
    await db.delete(searchConfigurations).where(eq(searchConfigurations.userId, data.userId));

    // 4. Delete the user records themselves
    await db.delete(userTable).where(eq(userTable.id, data.userId));

    return { success: true };
  });

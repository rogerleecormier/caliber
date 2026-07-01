'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
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
import { mapLegacyAnalysisStatus } from "@/lib/pipeline-constants";

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

export const debugLegacyBackfillState = createServerFn({ method: "GET" })
  .inputValidator((data: { userId?: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const adminUser = await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);
    const targetUserId = data.userId ?? adminUser.id;

    const legacyRows = await db
      .select({ id: jobAnalyses.id, jobUrl: jobAnalyses.jobUrl })
      .from(jobAnalyses)
      .where(eq(jobAnalyses.userId, targetUserId));

    const normalizedRows = await db
      .select({
        sourceUrl: normalizedJobs.sourceUrl,
        canonicalSourceUrl: normalizedJobs.canonicalSourceUrl,
        currentStage: normalizedJobs.currentStage,
        isFavorited: normalizedJobs.isFavorited,
      })
      .from(normalizedJobs)
      .where(eq(normalizedJobs.userId, targetUserId));

    const stageCounts: Record<string, number> = {};
    for (const row of normalizedRows) {
      const key = `${row.currentStage} (favorited=${row.isFavorited})`;
      stageCounts[key] = (stageCounts[key] ?? 0) + 1;
    }

    const normalizedUrlSet = new Set([
      ...normalizedRows.map((r) => r.sourceUrl),
      ...normalizedRows.map((r) => r.canonicalSourceUrl),
    ]);
    const matchedLegacyCount = legacyRows.filter((r) => r.jobUrl && normalizedUrlSet.has(r.jobUrl)).length;

    return {
      legacyCount: legacyRows.length,
      normalizedCount: normalizedRows.length,
      matchedLegacyCount,
      stageCounts,
    };
  });

export const backfillLegacyAnalyses = createServerFn({ method: "POST" })
  .inputValidator((data: { userId?: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    const adminUser = await requireAdmin(ctx);
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    const targetUserId = data.userId ?? adminUser.id;

    const legacyRows = await db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.userId, targetUserId));

    if (legacyRows.length === 0) return { inserted: 0, skipped: 0 };

    const existingUrls = await db
      .select({ sourceUrl: normalizedJobs.sourceUrl, canonicalSourceUrl: normalizedJobs.canonicalSourceUrl })
      .from(normalizedJobs)
      .where(eq(normalizedJobs.userId, targetUserId));
    // The DB enforces a unique (user_id, canonical_source_url) constraint, so dedup on
    // both fields — a legacy row's jobUrl becomes both sourceUrl and canonicalSourceUrl.
    const existingUrlSet = new Set([
      ...existingUrls.map((r) => r.sourceUrl),
      ...existingUrls.map((r) => r.canonicalSourceUrl),
    ]);

    let inserted = 0;
    let skipped = 0;

    const errors: string[] = [];

    // Build the list of rows to insert, also deduping within job_analyses itself
    // (legacy table has no uniqueness guarantee on job_url).
    const seenInBatch = new Set<string>();
    type PendingRow = { legacy: typeof legacyRows[number]; values: typeof normalizedJobs.$inferInsert };
    const pending: PendingRow[] = [];

    for (const row of legacyRows) {
      if (!row.jobUrl || existingUrlSet.has(row.jobUrl) || seenInBatch.has(row.jobUrl)) {
        skipped++;
        continue;
      }
      seenInBatch.add(row.jobUrl);

      const currentStage = mapLegacyAnalysisStatus({
        applied: row.applied,
        applicationStatus: row.applicationStatus ?? undefined,
        documents: [],
      });

      const now = row.createdAt ?? new Date().toISOString();

      pending.push({
        legacy: row,
        values: {
          userId: targetUserId,
          sourceOrigin: 'legacy',
          jobTitle: row.jobTitle ?? 'Untitled',
          employerName: row.company ?? 'Unknown',
          location: row.location ?? null,
          industry: row.industry ?? null,
          sourceUrl: row.jobUrl,
          canonicalSourceUrl: row.jobUrl,
          jdText: row.jdText ?? null,
          matchScore: row.matchScore ?? null,
          gapAnalysis: row.gapAnalysis ?? null,
          recommendations: row.recommendations ?? null,
          pursue: row.pursue ?? null,
          pursueJustification: row.pursueJustification ?? null,
          keywords: row.keywords ?? null,
          strategyNote: row.strategyNote ?? null,
          personalInterest: row.personalInterest ?? null,
          careerAnalysis: row.careerAnalysis ?? null,
          insights: row.insights ?? null,
          currentStage,
          isFavorited: true,
          discoveryTimestamp: now,
          lastSeenAt: now,
          analyzedAt: row.createdAt ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // Process one row at a time — each insert + optional doc update = 2 statements,
    // well within D1's per-request limit, and avoids large batch failures.
    for (const { legacy, values } of pending) {
      try {
        const [newJob] = await db.insert(normalizedJobs).values(values).returning({ id: normalizedJobs.id });

        if (legacy.id && newJob?.id) {
          await db
            .update(generatedDocuments)
            .set({ pipelineJobId: newJob.id })
            .where(eq(generatedDocuments.jobAnalysisId, legacy.id));
        }

        inserted++;
      } catch (err: any) {
        // Drizzle's D1 driver wraps the real SQLite error in `.cause`; the top-level
        // message is just the query text + params, which is useless for diagnosis.
        const rootMessage = err?.cause?.message ?? err?.message ?? String(err);
        errors.push(`Row ${legacy.id} (${legacy.jobTitle ?? legacy.jobUrl}): ${rootMessage}`);
        skipped++;
      }
    }

    return { inserted, skipped, errors };
  });

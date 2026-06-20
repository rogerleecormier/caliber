'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb, schema } from "@/db/db";
import { resolveSessionUser } from "@/lib/resolve-user";
import {
  getSearchAgentSettings,
  saveSearchAgentSettings,
  type SearchAgentSettings,
} from "@/lib/app-settings";

async function requireAdmin() {
  const user = await resolveSessionUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getSearchAgentAdminSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getSearchAgentSettings();
});

export const updateSearchAgentAdminSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<SearchAgentSettings>) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    return saveSearchAgentSettings(data);
  });

/**
 * Collapse legacy duplicate canonical jobs that share a dedupeKey (created before the
 * at-ingest dedup existed). Conservative: only removes duplicates that no user has saved,
 * moving their job_sources onto the kept (earliest) canonical job.
 */
export const runCanonicalJobDedupe = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);

  // dedupeKeys with more than one canonical job.
  const dupeGroups = await db
    .select({ dedupeKey: schema.jobs.dedupeKey, count: sql<number>`count(*)` })
    .from(schema.jobs)
    .where(isNotNull(schema.jobs.dedupeKey))
    .groupBy(schema.jobs.dedupeKey)
    .having(sql`count(*) > 1`)
    .limit(500);

  let merged = 0;
  for (const group of dupeGroups) {
    if (!group.dedupeKey) continue;
    const rows = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.dedupeKey, group.dedupeKey))
      .orderBy(schema.jobs.id);
    if (rows.length < 2) continue;

    const keepId = rows[0].id;
    const dupeIds = rows.slice(1).map((r) => r.id);

    // Skip any duplicate a user has saved (avoids user_jobs unique-constraint churn).
    const referenced = await db
      .select({ jobId: schema.userJobs.jobId })
      .from(schema.userJobs)
      .where(inArray(schema.userJobs.jobId, dupeIds));
    const referencedSet = new Set(referenced.map((r) => r.jobId));
    const removable = dupeIds.filter((id) => !referencedSet.has(id));
    if (removable.length === 0) continue;

    // Move their sources onto the keeper, then delete the duplicate canonical rows.
    await db
      .update(schema.jobSources)
      .set({ jobId: keepId })
      .where(inArray(schema.jobSources.jobId, removable));
    await db.delete(schema.jobs).where(inArray(schema.jobs.id, removable));
    merged += removable.length;
  }

  return { merged };
});

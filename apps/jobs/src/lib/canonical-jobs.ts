import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "../db/db";
import * as schema from "../db/schema";
import { normalizeJobFields } from "./normalize-job";

export interface CanonicalJobInput {
  title: string;
  company?: string | null;
  /** Raw/dirty description from the source (stored in descriptionRaw, cleansed later). */
  description?: string | null;
  sourceUrl: string;
  sourceName: string;
  categoryId: number;
  postDate?: Date | null;
  payRange?: string | null;
  location?: string | null;
  remoteType?: string;
}

export interface UpsertCanonicalJobResult {
  jobId: number;
  created: boolean;
}

/**
 * Single ingestion entry point for all sources. Guarantees ONE canonical jobs row per
 * logical job: an exact source URL re-post or a cross-source duplicate (same dedupeKey)
 * updates the canonical row and records the source in job_sources instead of inserting a
 * duplicate. Replaces the per-source onConflictDoUpdate on jobs.sourceUrl.
 */
export async function upsertCanonicalJob(
  db: DrizzleD1Database,
  input: CanonicalJobInput,
): Promise<UpsertCanonicalJobResult> {
  const norm = normalizeJobFields({
    title: input.title,
    company: input.company,
    description: input.description,
    location: input.location,
    payRange: input.payRange,
  });
  const now = new Date();
  const postDate = input.postDate ?? now;
  const description = input.description ?? "";

  // 1. Resolve an existing canonical job: exact source URL first, then semantic dedupeKey.
  let jobId: number | null = null;

  const [bySource] = await db
    .select({ jobId: schema.jobSources.jobId })
    .from(schema.jobSources)
    .where(eq(schema.jobSources.sourceUrl, input.sourceUrl))
    .limit(1);
  if (bySource) jobId = bySource.jobId;

  if (jobId === null) {
    // Legacy rows / primary source URL stored directly on jobs (pre-backfill).
    const [byJobUrl] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.sourceUrl, input.sourceUrl))
      .limit(1);
    if (byJobUrl) jobId = byJobUrl.id;
  }

  if (jobId === null && norm.dedupeKey) {
    const [byKey] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.dedupeKey, norm.dedupeKey))
      .limit(1);
    if (byKey) jobId = byKey.id;
  }

  if (jobId !== null) {
    // 2a. Update canonical row: refresh freshness, keep the longest description, earliest postDate.
    const [existing] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId))
      .limit(1);

    if (existing) {
      const newerDescription =
        description && description.length > (existing.descriptionRaw?.length ?? 0)
          ? description
          : existing.descriptionRaw;
      const earliestPost =
        existing.postDate && postDate
          ? (existing.postDate < postDate ? existing.postDate : postDate)
          : (existing.postDate ?? postDate);

      await db
        .update(schema.jobs)
        .set({
          title: input.title || existing.title,
          company: input.company ?? existing.company,
          descriptionRaw: newerDescription,
          isCleansed: newerDescription === existing.descriptionRaw ? existing.isCleansed : 0,
          payRange: input.payRange ?? existing.payRange,
          postDate: earliestPost,
          categoryId: input.categoryId || existing.categoryId,
          // Backfill normalized fields if missing.
          location: existing.location ?? norm.location,
          salaryMin: existing.salaryMin ?? norm.salaryMin,
          salaryMax: existing.salaryMax ?? norm.salaryMax,
          salaryCurrency: existing.salaryCurrency ?? norm.salaryCurrency,
          employmentType: existing.employmentType ?? norm.employmentType,
          seniorityLevel: existing.seniorityLevel ?? norm.seniorityLevel,
          companyNormalized: existing.companyNormalized ?? norm.companyNormalized,
          contentHash: existing.contentHash ?? norm.contentHash,
          dedupeKey: existing.dedupeKey ?? norm.dedupeKey,
          // Description may have changed → re-embed.
          embeddedAt: newerDescription === existing.descriptionRaw ? existing.embeddedAt : null,
          updatedAt: now,
        })
        .where(eq(schema.jobs.id, jobId));
    }

    // Record / refresh this source for the canonical job.
    await db
      .insert(schema.jobSources)
      .values({
        jobId,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        payRange: input.payRange ?? null,
        postDate,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: schema.jobSources.sourceUrl,
        set: { lastSeenAt: now, payRange: input.payRange ?? null, postDate },
      });

    return { jobId, created: false };
  }

  // 2b. New canonical job + first source.
  const [inserted] = await db
    .insert(schema.jobs)
    .values({
      title: input.title,
      company: input.company ?? null,
      descriptionRaw: description,
      isCleansed: 0,
      payRange: input.payRange ?? null,
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      categoryId: input.categoryId,
      postDate,
      remoteType: input.remoteType ?? "fully_remote",
      location: norm.location,
      salaryMin: norm.salaryMin,
      salaryMax: norm.salaryMax,
      salaryCurrency: norm.salaryCurrency,
      employmentType: norm.employmentType,
      seniorityLevel: norm.seniorityLevel,
      companyNormalized: norm.companyNormalized,
      contentHash: norm.contentHash,
      dedupeKey: norm.dedupeKey,
      embeddedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.jobs.id });

  const newJobId = inserted.id;
  await db.insert(schema.jobSources).values({
    jobId: newJobId,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    payRange: input.payRange ?? null,
    postDate,
    firstSeenAt: now,
    lastSeenAt: now,
  });

  return { jobId: newJobId, created: true };
}

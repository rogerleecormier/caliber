import { inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/db";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { upsertJobVectors, type VectorizeLike, type AiLike } from "@/lib/ai/embeddings";

export const EMBED_BATCH_SIZE = 100;

/**
 * Embed canonical jobs that have not yet been vectorized (embedded_at IS NULL) and stamp
 * the watermark. Safe no-op when Vectorize/AI bindings are unavailable (e.g. local dev).
 */
export async function backfillJobEmbeddings(
  env: Partial<CloudflareEnv>,
  limit = EMBED_BATCH_SIZE,
): Promise<{ embedded: number }> {
  if (!env.VECTORIZE || !env.AI || !env.DB) return { embedded: 0 };
  const db = getDb(env.DB);

  const rows = await db
    .select()
    .from(schema.jobs)
    .where(isNull(schema.jobs.embeddedAt))
    .limit(limit);
  if (rows.length === 0) return { embedded: 0 };

  await upsertJobVectors(
    env.VECTORIZE as unknown as VectorizeLike,
    env.AI as unknown as AiLike,
    rows.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      description: j.description || j.descriptionRaw || j.fullDescription,
      location: j.location,
      remoteType: j.remoteType,
      salaryMin: j.salaryMin,
      seniorityLevel: j.seniorityLevel,
      sourceName: j.sourceName,
      postDate: j.postDate,
    })),
  );

  await db
    .update(schema.jobs)
    .set({ embeddedAt: new Date() })
    .where(inArray(schema.jobs.id, rows.map((j) => j.id)));

  return { embedded: rows.length };
}

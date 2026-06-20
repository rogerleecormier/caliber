import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { getDbFromContext, schema } from "../../../../db/db";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getUserProfile } from "@/lib/user-profile";
import { getAIFromContext } from "@/lib/ai";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getProfileVector, queryJobVectors, type VectorizeLike, type AiLike } from "@/lib/ai/embeddings";

const PAGE_SIZE = 30;

/**
 * "All jobs" personalized ranking: every canonical job ranked by lightweight vector
 * similarity to the user's profile (+ preference prefilter). Falls back to recency when
 * there is no profile / Vectorize binding.
 */
export const Route = createFileRoute("/api/v3/jobs/recommended")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = await getDbFromContext(context as any);
          const url = new URL(request.url);
          const limit = parseInt(url.searchParams.get("limit") || String(PAGE_SIZE));
          const offset = parseInt(url.searchParams.get("offset") || "0");

          const user = await resolveSessionUser();
          const env = getCloudflareEnv();
          const ai = await getAIFromContext(context);

          const categoriesData = await db.select().from(schema.categories);
          const categoriesMap = new Map(categoriesData.map((c) => [c.id, c]));

          // Favorite state for the logged-in user.
          const favByJobId = new Map<number, schema.UserJob>();
          if (user?.id) {
            const ujs = await db
              .select()
              .from(schema.userJobs)
              .where(eq(schema.userJobs.userId, user.id));
            for (const uj of ujs) favByJobId.set(uj.jobId, uj);
          }

          const decorate = (job: schema.Job, recommendationScore?: number) => ({
            ...job,
            category: categoriesMap.get(job.categoryId) || categoriesData[0],
            userJob: favByJobId.get(job.id) ?? null,
            recommendationScore: recommendationScore ?? null,
          });

          // Personalized vector ranking.
          if (user?.id && env.VECTORIZE && ai) {
            const profile = await getUserProfile(db, user.id);
            if (profile.text) {
              try {
                const vector = await getProfileVector(
                  env.VECTORIZE as unknown as VectorizeLike,
                  ai as unknown as AiLike,
                  user.id,
                  profile.text,
                );
                if (vector) {
                  const matches = await queryJobVectors(env.VECTORIZE as unknown as VectorizeLike, vector, {
                    topK: offset + limit + 50,
                  });
                  const pageMatches = matches.slice(offset, offset + limit);
                  const ids = pageMatches.map((m) => m.jobId);
                  if (ids.length > 0) {
                    const rows = await db.select().from(schema.jobs).where(inArray(schema.jobs.id, ids));
                    const byId = new Map(rows.map((r) => [r.id, r]));
                    const jobs = pageMatches
                      .map((m) => {
                        const job = byId.get(m.jobId);
                        return job ? decorate(job, Math.round(m.score * 100)) : null;
                      })
                      .filter(Boolean);
                    return json({
                      success: true,
                      data: { jobs, total: matches.length, limit, offset, hasMore: offset + limit < matches.length, personalized: true },
                    });
                  }
                }
              } catch (err) {
                console.error("[recommended] vector ranking failed, falling back:", err);
              }
            }
          }

          // Fallback: recency.
          const rows = await db
            .select()
            .from(schema.jobs)
            .orderBy(desc(schema.jobs.postDate))
            .limit(limit)
            .offset(offset);
          const jobs = rows.map((j) => decorate(j));
          return json({
            success: true,
            data: { jobs, total: jobs.length, limit, offset, hasMore: rows.length >= limit, personalized: false },
          });
        } catch (error) {
          return json(
            { success: false, error: error instanceof Error ? error.message : "Failed to load recommendations" },
            { status: 500 },
          );
        }
      },
    },
  },
});

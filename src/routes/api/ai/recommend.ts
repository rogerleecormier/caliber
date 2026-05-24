import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { parseSearchQuery, getAIFromContext, type AIEnv } from "../../../lib/ai";
import { getDbFromContext, schema } from "../../../db/db";
import { like, or, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/ai/recommend")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const ai = await getAIFromContext(context);
          const db = await getDbFromContext(context);

          const body = await request.json() as { query: string };

          if (!body.query || body.query.trim().length < 3) {
            return json({ success: true, data: { jobs: [], parsed: null } });
          }

          // If AI is not available, fall back to simple keyword extraction
          let searchTerms: string[] = [];
          let parsedQuery = null;

          if (ai) {
            try {
              const env: AIEnv = { AI: ai };
              const response = await fetch("/api/ai/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: body.query }),
              });

              // Actually call AI directly instead of internal fetch
              const { parseSearchQuery: parse } = await import("../../../lib/ai");
              parsedQuery = await parse(env, body.query);

              // Extract all keywords and skills (deduplicated)
              const keywords = Array.isArray(parsedQuery.keywords) ? parsedQuery.keywords : [];
              const skills = Array.isArray(parsedQuery.skills) ? parsedQuery.skills : [];
              const combined = [...keywords, ...skills].map(s => s.toLowerCase());
              searchTerms = [...new Set(combined)].slice(0, 5); // Dedupe and limit
            } catch (aiError) {
              console.error("AI parsing failed, using fallback:", aiError);
              // Fallback: split query into words
              searchTerms = body.query.trim().split(/\s+/).filter(w => w.length > 2);
            }
          } else {
            // No AI: simple word extraction
            searchTerms = body.query.trim().split(/\s+/).filter(w => w.length > 2);
          }

          if (searchTerms.length === 0) {
            return json({ success: true, data: { jobs: [], parsed: parsedQuery } });
          }

          // Build search conditions - match on title, company, or description
          const conditions = searchTerms.map(term =>
            or(
              like(schema.jobs.title, `%${term}%`),
              like(schema.jobs.company, `%${term}%`),
              like(schema.jobs.description, `%${term}%`)
            )
          );

          // Query for jobs matching ANY of the terms, ordered by newest
          const matchedJobs = await db
            .select()
            .from(schema.jobs)
            .where(or(...conditions))
            .orderBy(desc(schema.jobs.postDate))
            .limit(3);

          // Get categories for the matched jobs
          const categoriesData = await db.select().from(schema.categories);
          const categoriesMap = new Map(categoriesData.map((c) => [c.id, c]));

          // Transform jobs with category
          const jobsWithCategories = matchedJobs.map((job) => ({
            ...job,
            category: categoriesMap.get(job.categoryId) || { id: 0, name: "Unknown", slug: "unknown" },
            isAIRecommended: true,
          }));

          return json({
            success: true,
            data: {
              jobs: jobsWithCategories,
              parsed: parsedQuery,
              searchTerms,
            },
          });
        } catch (error) {
          console.error("Error in AI recommend:", error);
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Recommendation failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});

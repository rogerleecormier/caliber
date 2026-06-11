import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAIFromContext, type AIEnv } from "../../../lib/ai";
import { getDbFromContext, schema } from "../../../db/db";
import { like, or, desc, isNull, and } from "drizzle-orm";

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
              await fetch("/api/ai/search", {
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
              like(schema.normalizedJobs.jobTitle, `%${term}%`),
              like(schema.normalizedJobs.employerName, `%${term}%`),
              like(schema.normalizedJobs.description, `%${term}%`)
            )
          );

          // Query for jobs matching ANY of the terms, ordered by newest (global ATS catalog only)
          const matchedJobs = await db
            .select()
            .from(schema.normalizedJobs)
            .where(and(isNull(schema.normalizedJobs.userId), or(...conditions)))
            .orderBy(desc(schema.normalizedJobs.discoveryTimestamp))
            .limit(3);

          const jobsWithCategories = matchedJobs.map((job) => ({
            ...job,
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

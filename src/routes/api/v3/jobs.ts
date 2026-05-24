import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getDbFromContext, schema } from "../../../db/db";
import { eq, like, or, and, desc, asc, sql } from "drizzle-orm";

export const Route = createFileRoute("/api/v3/jobs")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const ctx = context as any;
          const db = await getDbFromContext(ctx);

          const url = new URL(request.url);
          const query = url.searchParams.get("search") || undefined;
          const categoryId = url.searchParams.get("category")
            ? parseInt(url.searchParams.get("category")!)
            : undefined;
          const source = url.searchParams.get("source") || undefined;
          const company = url.searchParams.get("company") || undefined;
          const sortBy =
            (url.searchParams.get("sortBy") as
              | "newest"
              | "oldest"
              | "title-asc"
              | "title-desc"
              | "recently-added") || "newest";
          const limit = parseInt(url.searchParams.get("limit") || "30");
          const offset = parseInt(url.searchParams.get("offset") || "0");

          // Build WHERE conditions at database level
          const conditions = [];

          if (categoryId) {
            conditions.push(eq(schema.jobs.categoryId, categoryId));
          }
          if (source) {
            conditions.push(eq(schema.jobs.sourceName, source));
          }
          if (company) {
            conditions.push(eq(schema.jobs.company, company));
          }
          if (query) {
            // Simple LIKE search on title and company
            conditions.push(
              or(
                like(schema.jobs.title, `%${query}%`),
                like(schema.jobs.company, `%${query}%`)
              )
            );
          }

          // Determine sort order
          let orderByClause;
          switch (sortBy) {
            case "oldest":
              orderByClause = asc(schema.jobs.postDate);
              break;
            case "title-asc":
              orderByClause = asc(schema.jobs.title);
              break;
            case "title-desc":
              orderByClause = desc(schema.jobs.title);
              break;
            case "recently-added":
              orderByClause = desc(schema.jobs.createdAt);
              break;
            case "newest":
            default:
              orderByClause = desc(schema.jobs.postDate);
              break;
          }

          // Get total count for pagination
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.jobs)
            .where(conditions.length > 0 ? and(...conditions) : undefined);
          
          const total = countResult[0]?.count || 0;

          // Fetch jobs with filters applied at database level
          const jobsData = await db
            .select()
            .from(schema.jobs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(orderByClause)
            .limit(limit)
            .offset(offset);

          // Fetch all categories for mapping
          const categoriesData = await db.select().from(schema.categories);
          const categoriesMap = new Map(categoriesData.map((c) => [c.id, c]));

          // Transform to include category data
          const jobsWithCategories = jobsData.map((job) => {
            const category = categoriesMap.get(job.categoryId);
            const defaultCategory = categoriesData[0] || {
              id: 0,
              name: "Unknown",
              slug: "unknown",
            };

            return {
              ...job,
              category: category || defaultCategory,
            };
          });

          return json({
            success: true,
            data: {
              jobs: jobsWithCategories,
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          });
        } catch (error) {
          console.error("Error fetching jobs:", error);
          return json(
            {
              success: false,
              error:
                error instanceof Error ? error.message : "Failed to fetch jobs",
              details: String(error),
            },
            { status: 500 }
          );
        }
      },
    },
  },
});

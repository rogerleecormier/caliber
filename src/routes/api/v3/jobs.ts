import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getDbFromContext, schema } from "../../../db/db";
import { isNull, like, or, and, desc, asc, sql } from "drizzle-orm";

// Legacy global ATS catalog browser API. Stubbed against normalizedJobs
// (userId IS NULL = global catalog rows) pending a follow-on epic rebuild.
export const Route = createFileRoute("/api/v3/jobs")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const ctx = context as any;
          const db = await getDbFromContext(ctx);

          const url = new URL(request.url);
          const query = url.searchParams.get("search") || undefined;
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

          const conditions = [isNull(schema.normalizedJobs.userId)];

          if (source) {
            conditions.push(sql`${schema.normalizedJobs.sourceOrigin} = ${source}`);
          }
          if (company) {
            conditions.push(sql`${schema.normalizedJobs.employerName} = ${company}`);
          }
          if (query) {
            conditions.push(
              or(
                like(schema.normalizedJobs.jobTitle, `%${query}%`),
                like(schema.normalizedJobs.employerName, `%${query}%`)
              )!
            );
          }

          let orderByClause;
          switch (sortBy) {
            case "oldest":
              orderByClause = asc(schema.normalizedJobs.discoveryTimestamp);
              break;
            case "title-asc":
              orderByClause = asc(schema.normalizedJobs.jobTitle);
              break;
            case "title-desc":
              orderByClause = desc(schema.normalizedJobs.jobTitle);
              break;
            case "recently-added":
              orderByClause = desc(schema.normalizedJobs.createdAt);
              break;
            case "newest":
            default:
              orderByClause = desc(schema.normalizedJobs.discoveryTimestamp);
              break;
          }

          const whereClause = and(...conditions);

          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.normalizedJobs)
            .where(whereClause);

          const total = countResult[0]?.count || 0;

          const jobsData = await db
            .select()
            .from(schema.normalizedJobs)
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(limit)
            .offset(offset);

          return json({
            success: true,
            data: {
              jobs: jobsData,
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

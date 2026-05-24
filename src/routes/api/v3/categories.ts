import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getDbFromContext, schema } from "../../../db/db";
import { sql } from "drizzle-orm";

export const Route = createFileRoute("/api/v3/categories")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const ctx = context as any;
        const db = await getDbFromContext(ctx);
        try {
          // Fetch all categories with job counts
          const categoriesWithCounts = await db
            .select()
            .from(schema.categories);

          // Get job counts for each category
          const categoriesData = await Promise.all(
            categoriesWithCounts.map(async (category) => {
              const jobCount = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.jobs)
                .where(sql`category_id = ${category.id}`);

              return {
                ...category,
                jobCount: Number(jobCount[0]?.count || 0),
              };
            })
          );

          return json({
            success: true,
            data: categoriesData,
          });
        } catch (error) {
          console.error("Error fetching categories:", error);
          return json(
            {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to fetch categories",
              details: String(error),
            },
            { status: 500 }
          );
        }
      },
    },
  },
});

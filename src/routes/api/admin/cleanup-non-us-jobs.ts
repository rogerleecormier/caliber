import { createFileRoute } from "@tanstack/react-router"
import { json } from "@tanstack/react-start"
import { getDbFromContext } from "@/db/db"
import { cleanupNonUSJobs } from "@/lib/cleanup-non-us-jobs"

export const Route = createFileRoute("/api/admin/cleanup-non-us-jobs")({
  server: {
    handlers: {
      POST: async ({ context }) => {
        try {
          const ctx = context as any
          const db = await getDbFromContext(ctx)
          const result = await cleanupNonUSJobs(db)
          return json({
            success: true,
            message: `Deleted ${result.deletedLinkedin} non-US LinkedIn jobs and ${result.deletedPipeline} non-US pipeline jobs`,
            ...result,
          })
        } catch (error) {
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
          )
        }
      },
    },
  },
})

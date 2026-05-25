import { createFileRoute } from "@tanstack/react-router"
import { json } from "@tanstack/react-start"
import { cleanupNonUSJobs } from "@/lib/cleanup-non-us-jobs"

export const Route = createFileRoute("/api/admin/cleanup-non-us-jobs")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await cleanupNonUSJobs()
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

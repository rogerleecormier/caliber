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
          let db;
          try {
            db = await getDbFromContext(ctx)
          } catch (dbError) {
            const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError)
            console.error('[Cleanup Non-US Jobs] DB connection failed:', dbErrorMsg)
            return json({
              success: false,
              error: `Database connection failed: ${dbErrorMsg}`,
            }, { status: 500 })
          }

          if (!db) {
            return json({
              success: false,
              error: 'Database instance is null or undefined',
            }, { status: 500 })
          }

          const result = await cleanupNonUSJobs(db)
          return json({
            success: true,
            message: `Deleted ${result.deletedLinkedin} non-US LinkedIn jobs and ${result.deletedPipeline} non-US pipeline jobs`,
            ...result,
          })
        } catch (error) {
          console.error('[Cleanup Non-US Jobs] Error:', error)
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

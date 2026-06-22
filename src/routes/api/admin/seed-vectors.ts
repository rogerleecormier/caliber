import { createFileRoute } from "@tanstack/react-router"
import { json } from "@tanstack/react-start"
import { getCloudflareEnvAsync } from "@/lib/cloudflare"
import { embedJob, upsertVector } from "@/server/dedup/embedding"

const BATCH_SIZE = 50;

export const Route = createFileRoute("/api/admin/seed-vectors")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const env = await getCloudflareEnvAsync();
          if (!env.DB) return json({ success: false, error: "Database unavailable" }, { status: 500 });
          if (!env.AI) return json({ success: false, error: "AI binding unavailable" }, { status: 500 });
          if (!env.VECTORIZE) return json({ success: false, error: "Vectorize binding unavailable" }, { status: 500 });

          // Count total unseeded jobs
          const countRow = await env.DB.prepare(
            `SELECT COUNT(*) as total FROM canonical_jobs WHERE vector_id IS NULL AND is_listed = 1`
          ).first<{ total: number }>();
          const total = countRow?.total ?? 0;

          let seeded = 0;
          let failed = 0;
          let offset = 0;

          while (offset < total) {
            const { results: batch } = await env.DB.prepare(
              `SELECT id, title_display, company_display, company_norm, location_display, description_plain
               FROM canonical_jobs
               WHERE vector_id IS NULL AND is_listed = 1
               ORDER BY first_seen_at DESC
               LIMIT ? OFFSET ?`
            ).bind(BATCH_SIZE, offset).all<{
              id: string;
              title_display: string;
              company_display: string;
              company_norm: string;
              location_display: string | null;
              description_plain: string | null;
            }>();

            if (!batch || batch.length === 0) break;

            for (const job of batch) {
              try {
                const vector = await embedJob(env as any, {
                  titleDisplay: job.title_display,
                  companyDisplay: job.company_display,
                  titleNorm: '',
                  companyNorm: job.company_norm,
                  locationDisplay: job.location_display ?? undefined,
                  descriptionPlain: job.description_plain ?? undefined,
                  remote: false,
                  dedupKey: '',
                  rawHash: '',
                });
                await upsertVector(env as any, job.id, job.company_norm, vector);
                seeded++;
              } catch (err) {
                console.error(`[seed-vectors] Failed to embed job ${job.id}:`, err);
                failed++;
              }
            }

            console.log(`[seed-vectors] Progress: ${seeded + failed}/${total} (${seeded} seeded, ${failed} failed)`);
            offset += BATCH_SIZE;
          }

          return json({
            success: true,
            message: `Seeded ${seeded} of ${total} jobs (${failed} failed)`,
            seeded,
            failed,
            total,
          });
        } catch (error) {
          console.error("[seed-vectors] Error:", error);
          return json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
          );
        }
      },
    },
  },
})

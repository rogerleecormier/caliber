import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { and, desc, eq, or } from "drizzle-orm";
import { getDbFromContext, schema } from "../../../db/db";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getUserProfile } from "@/lib/user-profile";
import { getAIFromContext } from "@/lib/ai";
import { scoreJobAgainstProfile } from "@/lib/ai/job-score";

export const Route = createFileRoute("/api/v3/my-jobs")({
  server: {
    handlers: {
      // List the user's favorited + agent-auto-favorited jobs with scores.
      GET: async ({ context }) => {
        try {
          const user = await resolveSessionUser();
          if (!user?.id) return json({ success: false, error: "Authentication required" }, { status: 401 });

          const db = await getDbFromContext(context as any);
          const rows = await db
            .select({ userJob: schema.userJobs, job: schema.jobs })
            .from(schema.userJobs)
            .innerJoin(schema.jobs, eq(schema.userJobs.jobId, schema.jobs.id))
            .where(
              and(
                eq(schema.userJobs.userId, user.id),
                or(eq(schema.userJobs.favorited, true), eq(schema.userJobs.autoFavorited, true)),
              ),
            )
            .orderBy(desc(schema.userJobs.masterScore), desc(schema.userJobs.updatedAt));

          const jobs = rows.map((r) => ({
            ...r.job,
            userJob: r.userJob,
          }));
          return json({ success: true, data: { jobs, total: jobs.length } });
        } catch (error) {
          return json(
            { success: false, error: error instanceof Error ? error.message : "Failed to load my jobs" },
            { status: 500 },
          );
        }
      },

      // Favorite / unfavorite a canonical job. On favorite, score it on-demand vs the resume.
      POST: async ({ request, context }) => {
        try {
          const user = await resolveSessionUser();
          if (!user?.id) return json({ success: false, error: "Authentication required" }, { status: 401 });

          const body = (await request.json()) as { jobId?: number; action?: "favorite" | "unfavorite" };
          const jobId = Number(body.jobId);
          const action = body.action ?? "favorite";
          if (!Number.isFinite(jobId)) return json({ success: false, error: "jobId required" }, { status: 400 });

          const db = await getDbFromContext(context as any);
          const now = new Date().toISOString();

          const [existing] = await db
            .select()
            .from(schema.userJobs)
            .where(and(eq(schema.userJobs.userId, user.id), eq(schema.userJobs.jobId, jobId)))
            .limit(1);

          if (action === "unfavorite") {
            if (existing) {
              await db
                .update(schema.userJobs)
                .set({ favorited: false, updatedAt: now })
                .where(eq(schema.userJobs.id, existing.id));
            }
            return json({ success: true, data: { favorited: false } });
          }

          // action === "favorite"
          if (existing) {
            await db
              .update(schema.userJobs)
              .set({ favorited: true, relationship: existing.relationship, updatedAt: now })
              .where(eq(schema.userJobs.id, existing.id));
            return json({ success: true, data: { favorited: true, scored: existing.masterScore != null } });
          }

          // New manual favorite — score it on demand if we have a profile + AI.
          const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
          if (!job) return json({ success: false, error: "Job not found" }, { status: 404 });

          const profile = await getUserProfile(db, user.id);
          const ai = await getAIFromContext(context);
          let score: Awaited<ReturnType<typeof scoreJobAgainstProfile>> | null = null;
          if (profile.text && ai) {
            try {
              score = await scoreJobAgainstProfile(ai, profile.text, {
                id: String(job.id),
                title: job.title,
                description: job.description || job.descriptionRaw || job.fullDescription || job.title,
              });
            } catch (err) {
              console.error("[my-jobs] on-demand scoring failed:", err);
            }
          }

          await db.insert(schema.userJobs).values({
            userId: user.id,
            jobId,
            relationship: "manual",
            favorited: true,
            autoFavorited: false,
            atsScore: score?.atsScore,
            careerScore: score?.careerScore,
            outlookScore: score?.outlookScore,
            masterScore: score?.masterScore,
            atsReason: score?.atsReason,
            careerReason: score?.careerReason,
            outlookReason: score?.outlookReason,
            isUnicorn: score?.isUnicorn ?? false,
            unicornReason: score?.unicornReason ?? null,
            status: "Analyzed",
            scoredAt: score ? now : null,
            createdAt: now,
            updatedAt: now,
          });

          return json({ success: true, data: { favorited: true, scored: !!score } });
        } catch (error) {
          return json(
            { success: false, error: error instanceof Error ? error.message : "Failed to update favorite" },
            { status: 500 },
          );
        }
      },
    },
  },
});

'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { jobAnalyses } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";

export const getAnalysis = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) throw new Error("Database not available in development mode.");
      const db = getDb(env.DB);

      const user = await resolveSessionUser();
      if (!user) throw new Error("Not authenticated");

      const [row] = await db
        .select()
        .from(jobAnalyses)
        .where(and(eq(jobAnalyses.id, data.id), eq(jobAnalyses.userId, user.id)))
        .limit(1);

      if (!row) throw new Error("Analysis not found");

      return {
        id: row.id,
        jobTitle: row.jobTitle ?? "Untitled Position",
        company: row.company ?? "Unknown Company",
        industry: row.industry ?? undefined,
        location: row.location ?? undefined,
        matchScore: row.matchScore ?? 0,
        pursueJustification: row.pursueJustification ?? "No justification provided",
        gapAnalysis: JSON.parse(row.gapAnalysis ?? "[]"),
        recommendations: JSON.parse(row.recommendations ?? "[]"),
        keywords: JSON.parse(row.keywords ?? "[]"),
        pursue: row.pursue === 1,
        strategyNote: row.strategyNote ?? "",
        personalInterest: row.personalInterest ?? "",
        careerAnalysis: row.careerAnalysis ? JSON.parse(row.careerAnalysis) : null,
        insights: row.insights ? JSON.parse(row.insights) : null,
        applied: row.applied === 1,
        appliedAt: row.appliedAt ?? null,
        jobUrl: row.jobUrl,
        jdText: row.jdText,
        createdAt: row.createdAt,
      };
    } catch (error) {
      console.error("getAnalysis error:", error);
      throw error;
    }
  });

'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { analyticsSummary, pipelineJobs } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";
import type { PipelineCounts } from "@/lib/pipeline-constants";

export interface AnalyticsSummaryData {
  period: string;
  topJdKeywords: Array<{ keyword: string; count: number }>;
  topResumeKeywords: Array<{ keyword: string; count: number }>;
  topJobTitles: Array<{ title: string; count: number }>;
  topIndustries: Array<{ industry: string; count: number }>;
  averageMatchScore: number;
  totalAnalyses: number;
  totalResumesGenerated: number;
  totalApplied: number;
  totalPursued: number;
  pipelineCounts?: PipelineCounts;
  updatedAt: string;
}

const EMPTY = (period: string): AnalyticsSummaryData => ({
  period,
  topJdKeywords: [],
  topResumeKeywords: [],
  topJobTitles: [],
  topIndustries: [],
  averageMatchScore: 0,
  totalAnalyses: 0,
  totalResumesGenerated: 0,
  totalApplied: 0,
  totalPursued: 0,
  pipelineCounts: {
    discovered: 0,
    analyzed: 0,
    prepped: 0,
    applied: 0,
    interviewed: 0,
    hired: 0,
    notHired: 0,
    archived: 0,
  },
  updatedAt: new Date().toISOString(),
});

export const getAnalytics = createServerFn({ method: "GET" })
  .inputValidator((data: { period?: string }) => data)
  .handler(async ({ data }): Promise<AnalyticsSummaryData | null> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) return EMPTY(data.period ?? "all_time");

      const user = await resolveSessionUser();
      if (!user) return null;

      const period = data.period ?? "all_time";
      const db = getDb(env.DB);

      const [row] = await db
        .select()
        .from(analyticsSummary)
        .where(and(eq(analyticsSummary.period, period), eq(analyticsSummary.userId, user.id)))
        .limit(1);

      if (!row) return null;

      // Always compute totalPursued live — the aggregated column may be stale
      const [pursuedResult] = await db
        .select({ count: sql<number>`sum(case when ${pipelineJobs.pursue} = 1 then 1 else 0 end)` })
        .from(pipelineJobs)
        .where(eq(pipelineJobs.userId, user.id));
      const totalPursued = Number(pursuedResult?.count ?? 0);

      // Get pipeline counts by status
      const statusCounts = await db
        .select({
          status: pipelineJobs.status,
          count: sql<number>`count(*)`,
        })
        .from(pipelineJobs)
        .where(eq(pipelineJobs.userId, user.id))
        .groupBy(pipelineJobs.status);

      const pipelineCounts: PipelineCounts = {
        discovered: 0,
        analyzed: 0,
        prepped: 0,
        applied: 0,
        interviewed: 0,
        hired: 0,
        notHired: 0,
        archived: 0,
      };

      statusCounts.forEach((row) => {
        const status = row.status;
        if (status === 'Not Hired') {
          pipelineCounts.notHired = Number(row.count ?? 0);
        } else if (status && status in pipelineCounts) {
          const key = status.charAt(0).toLowerCase() + status.slice(1) as keyof PipelineCounts;
          pipelineCounts[key] = Number(row.count ?? 0);
        }
      });

      return {
        period: row.period,
        topJdKeywords: JSON.parse(row.topJdKeywords ?? "[]"),
        topResumeKeywords: JSON.parse(row.topResumeKeywords ?? "[]"),
        topJobTitles: JSON.parse(row.topJobTitles ?? "[]"),
        topIndustries: JSON.parse(row.topIndustries ?? "[]"),
        averageMatchScore: row.averageMatchScore ?? 0,
        totalAnalyses: row.totalAnalyses ?? 0,
        totalResumesGenerated: row.totalResumesGenerated ?? 0,
        totalApplied: row.totalApplied ?? 0,
        totalPursued,
        pipelineCounts,
        updatedAt: row.updatedAt ?? "",
      };
    } catch (error) {
      console.error("[getAnalytics] error:", error);
      return EMPTY(data.period ?? "all_time");
    }
  });

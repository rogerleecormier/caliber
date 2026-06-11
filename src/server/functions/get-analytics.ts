'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { normalizedJobs, generatedDocuments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";

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
  updatedAt: string;

  // --- Extended Powerhouse Fields ---
  totalJobsDiscovered: number;
  unicornCount: number;
  matchScoreDistribution: Array<{ range: string; count: number }>;
  workplaceTypeDistribution: Array<{ type: string; count: number }>;
  sourceDistribution: Array<{ source: string; count: number }>;
  pipelineConversions: Array<{ status: string; count: number }>;
  recentAnalyses: Array<{
    id: number;
    title: string;
    company: string;
    location: string | null;
    industry: string | null;
    sourceName: string;
    sourceUrl: string;
    matchScore: number | null;
    status: string;
    postDateText: string | null;
    createdAt: string;
    analyzedAt: string | null;
    isUnicorn: boolean;
  }>;
  allJobs: Array<{
    id: number;
    title: string;
    company: string;
    location: string | null;
    industry: string | null;
    sourceName: string;
    sourceUrl: string;
    matchScore: number | null;
    status: string;
    postDateText: string | null;
    createdAt: string;
    analyzedAt: string | null;
    isUnicorn: boolean;
    keywords: string[];
    workplaceType: string | null;
  }>;
}

// ─── Utility functions for rollup ───────────────────────────────────────────

function canonicalizeJobTitle(rawTitle: string): string {
  let title = rawTitle.toLowerCase().trim();
  title = title.replace(/\([^)]*\)/g, " ");
  title = title.replace(/\[[^\]]*\]/g, " ");
  title = title.split(/\s+\|\s+|\s+@\s+|\s+at\s+/)[0] ?? title;
  title = title.split(/\s+-\s+/)[0] ?? title;
  title = title.replace(/[^a-z0-9\s/&-]/g, " ");
  title = title.replace(/\s+/g, " ").trim();

  const seniorityPrefix = (() => {
    if (/^(chief|cxo|vp|vice president|svp|evp)\b/.test(title)) return "executive";
    if (/^(principal|head|director)\b/.test(title)) return "principal";
    if (/^(senior|sr)\b/.test(title)) return "senior";
    if (/^(lead|staff)\b/.test(title)) return "lead";
    if (/^(associate|assoc|asc)\b/.test(title)) return "associate";
    if (/^(junior|jr)\b/.test(title)) return "junior";
    return "";
  })();

  const withoutPrefix = title
    .replace(/^(chief|cxo|vp|vice president|svp|evp|principal|head|director|senior|sr|lead|staff|associate|assoc|asc|junior|jr)\b\s*/g, "")
    .replace(/\b(ii|iii|iv|i)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedBase = (() => {
    if (/technical project manager/.test(withoutPrefix)) return "technical project manager";
    if (/technical program manager/.test(withoutPrefix)) return "technical program manager";
    if (/project manager/.test(withoutPrefix)) return "project manager";
    if (/program manager/.test(withoutPrefix)) return "program manager";
    if (/product manager/.test(withoutPrefix)) return "product manager";
    return withoutPrefix;
  })();

  if (!normalizedBase) return "";
  return seniorityPrefix ? `${seniorityPrefix} ${normalizedBase}` : normalizedBase;
}

function toDisplayWord(word: string): string {
  if (word === "vp") return "VP";
  if (word === "cxo") return "CXO";
  if (word === "sr") return "Sr";
  if (word === "jr") return "Jr";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function toDisplayTitle(canonicalTitle: string): string {
  return canonicalTitle
    .split(" ")
    .filter(Boolean)
    .map(toDisplayWord)
    .join(" ");
}

function topN<T extends Record<string, unknown>>(arr: T[], _key: keyof T, n: number): T[] {
  return arr
    .sort((a, b) => (b as Record<string, number>).count - (a as Record<string, number>).count)
    .slice(0, n);
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
  updatedAt: new Date().toISOString(),
  totalJobsDiscovered: 0,
  unicornCount: 0,
  matchScoreDistribution: [],
  workplaceTypeDistribution: [],
  sourceDistribution: [],
  pipelineConversions: [],
  recentAnalyses: [],
  allJobs: [],
});

export const getAnalytics = createServerFn({ method: "GET" })
  .inputValidator((data: { period?: string }) => data)
  .handler(async ({ data }, ctx): Promise<AnalyticsSummaryData | null> => {
    try {
      const env = await getCloudflareEnvAsync();
      if (!env.DB) return EMPTY(data.period ?? "all_time");

      const user = await resolveSessionUser((ctx as any)?.request);
      if (!user) return null;

      const period = data.period ?? "all_time";
      const db = getDb(env.DB);

      // 1. Fetch user normalized jobs
      const userJobs = await db
        .select({
          id: normalizedJobs.id,
          title: normalizedJobs.jobTitle,
          company: normalizedJobs.employerName,
          location: normalizedJobs.location,
          industry: normalizedJobs.industry,
          sourceName: normalizedJobs.sourceOrigin,
          sourceUrl: normalizedJobs.sourceUrl,
          workplaceType: normalizedJobs.workplaceType,
          salary: normalizedJobs.salary,
          atsScore: normalizedJobs.atsScore,
          careerScore: normalizedJobs.careerScore,
          outlookScore: normalizedJobs.outlookScore,
          masterScore: normalizedJobs.masterScore,
          isUnicorn: normalizedJobs.isUnicorn,
          matchScore: normalizedJobs.matchScore,
          pursue: normalizedJobs.pursue,
          status: normalizedJobs.currentStage,
          keywords: normalizedJobs.keywords,
          createdAt: normalizedJobs.createdAt,
          analyzedAt: normalizedJobs.analyzedAt,
          postDateText: normalizedJobs.postDateText,
        })
        .from(normalizedJobs)
        .where(eq(normalizedJobs.userId, user.id));

      if (userJobs.length === 0) {
        return EMPTY(period);
      }

      // Filter jobs based on period
      let filteredJobs = userJobs;
      if (period !== "all_time") {
        filteredJobs = userJobs.filter((j) => {
          const dateStr = j.analyzedAt || j.createdAt || "";
          return dateStr.startsWith(period);
        });
      }

      const analyzedJobs = filteredJobs.filter((j) => j.matchScore !== null);
      const userJobIds = new Set(userJobs.map((j) => j.id));

      // 2. Fetch and filter generated documents
      const docs = await db
        .select({
          id: generatedDocuments.id,
          docType: generatedDocuments.docType,
          resumeKeywords: generatedDocuments.resumeKeywords,
          pipelineJobId: generatedDocuments.pipelineJobId,
          jobAnalysisId: generatedDocuments.jobAnalysisId,
        })
        .from(generatedDocuments);

      const userDocs = docs.filter(
        (d) =>
          (d.pipelineJobId && userJobIds.has(d.pipelineJobId)) ||
          (d.jobAnalysisId && userJobIds.has(d.jobAnalysisId))
      );

      // 3. JD keywords
      const jdKeywordMap = new Map<string, number>();
      for (const a of analyzedJobs) {
        if (a.keywords) {
          try {
            const keywords: string[] = JSON.parse(a.keywords);
            for (const kw of keywords) {
              const k = kw.toLowerCase().trim();
              if (k) jdKeywordMap.set(k, (jdKeywordMap.get(k) ?? 0) + 1);
            }
          } catch (e) {}
        }
      }
      const topJdKeywords = topN(
        Array.from(jdKeywordMap.entries()).map(([keyword, count]) => ({ keyword, count })),
        "count",
        30
      );

      // 4. Resume keywords
      const resumeKeywordMap = new Map<string, number>();
      for (const doc of userDocs) {
        if (doc.docType === "resume" && doc.resumeKeywords) {
          try {
            const keywords: string[] = JSON.parse(doc.resumeKeywords);
            for (const kw of keywords) {
              const k = kw.toLowerCase().trim();
              if (k) resumeKeywordMap.set(k, (resumeKeywordMap.get(k) ?? 0) + 1);
            }
          } catch (e) {}
        }
      }
      const topResumeKeywords = topN(
        Array.from(resumeKeywordMap.entries()).map(([keyword, count]) => ({ keyword, count })),
        "count",
        30
      );

      // 5. Top job titles (from applied/interviewed/hired roles)
      const titleMap = new Map<string, { count: number; displayTitle: string }>();
      for (const a of filteredJobs) {
        if (["Applied", "Interviewed", "Hired", "Not Hired"].includes(a.status)) {
          const rawTitle = (a.title ?? "").trim();
          if (!rawTitle) continue;
          const canonicalTitle = canonicalizeJobTitle(rawTitle);
          if (!canonicalTitle) continue;
          const existing = titleMap.get(canonicalTitle);
          if (existing) {
            existing.count += 1;
          } else {
            titleMap.set(canonicalTitle, {
              count: 1,
              displayTitle: toDisplayTitle(canonicalTitle),
            });
          }
        }
      }
      const topJobTitles = topN(
        Array.from(titleMap.values()).map(({ displayTitle, count }) => ({
          title: displayTitle,
          count,
        })),
        "count",
        15
      );

      // 6. Top industries
      const industryMap = new Map<string, number>();
      for (const a of analyzedJobs) {
        const industry = (a.industry ?? "").trim();
        if (industry) industryMap.set(industry, (industryMap.get(industry) ?? 0) + 1);
      }
      const topIndustries = topN(
        Array.from(industryMap.entries()).map(([industry, count]) => ({ industry, count })),
        "count",
        15
      );

      // 7. Numeric stats
      const scores = analyzedJobs.map((a) => a.matchScore).filter((s): s is number => s !== null);
      const averageMatchScore =
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      const totalResumesGenerated = userDocs.filter((d) => d.docType === "resume").length;
      const totalApplied = filteredJobs.filter((a) =>
        ["Applied", "Interviewed", "Hired", "Not Hired"].includes(a.status)
      ).length;
      const totalPursued = filteredJobs.filter((a) => a.pursue === 1).length;

      // 8. Workplace Type distribution
      const workplaceTypeMap = new Map<string, number>();
      for (const j of filteredJobs) {
        let type = j.workplaceType || "Remote";
        if (type.toLowerCase() === "fully_remote") type = "Remote";
        if (type.toLowerCase() === "on_site") type = "On-site";
        const normalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        workplaceTypeMap.set(normalized, (workplaceTypeMap.get(normalized) ?? 0) + 1);
      }
      const workplaceTypeDistribution = Array.from(workplaceTypeMap.entries()).map(
        ([type, count]) => ({ type, count })
      );

      // 9. Source distribution
      const sourceMap = new Map<string, number>();
      for (const j of filteredJobs) {
        const src = j.sourceName || "LinkedIn";
        sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
      }
      const sourceDistribution = Array.from(sourceMap.entries()).map(([source, count]) => ({
        source,
        count,
      }));

      // 10. Pipeline Conversion
      const statusMap = new Map<string, number>();
      const validStatuses = [
        "Discovered",
        "Analyzed",
        "Prepped",
        "Applied",
        "Interviewed",
        "Hired",
        "Not Hired",
        "Archived",
      ];
      for (const status of validStatuses) {
        statusMap.set(status, 0);
      }
      for (const j of filteredJobs) {
        statusMap.set(j.status, (statusMap.get(j.status) ?? 0) + 1);
      }
      const pipelineConversions = Array.from(statusMap.entries()).map(([status, count]) => ({
        status,
        count,
      }));

      // 11. Match Score Distribution
      const matchScoreDistribution = [
        {
          range: "Strong (80-100)",
          count: analyzedJobs.filter((j) => j.matchScore !== null && j.matchScore >= 80).length,
        },
        {
          range: "Moderate (60-79)",
          count: analyzedJobs.filter(
            (j) => j.matchScore !== null && j.matchScore >= 60 && j.matchScore < 80
          ).length,
        },
        {
          range: "Weak (0-59)",
          count: analyzedJobs.filter((j) => j.matchScore !== null && j.matchScore < 60).length,
        },
      ];

      // 12. Recent Analyses
      const recentAnalyses = [...analyzedJobs]
        .sort((a, b) => {
          const dateA = a.analyzedAt || a.createdAt || "";
          const dateB = b.analyzedAt || b.createdAt || "";
          return dateB.localeCompare(dateA);
        })
        .slice(0, 10)
        .map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          industry: j.industry,
          sourceName: j.sourceName,
          sourceUrl: j.sourceUrl,
          matchScore: j.matchScore,
          status: j.status,
          postDateText: j.postDateText,
          createdAt: j.createdAt,
          analyzedAt: j.analyzedAt,
          isUnicorn: j.isUnicorn === 1,
        }));

      return {
        period,
        topJdKeywords,
        topResumeKeywords,
        topJobTitles,
        topIndustries,
        averageMatchScore: Math.round(averageMatchScore * 10) / 10,
        totalAnalyses: analyzedJobs.length,
        totalResumesGenerated,
        totalApplied,
        totalPursued,
        totalJobsDiscovered: filteredJobs.length,
        unicornCount: filteredJobs.filter((j) => j.isUnicorn === 1).length,
        matchScoreDistribution,
        workplaceTypeDistribution,
        sourceDistribution,
        pipelineConversions,
        recentAnalyses,
        allJobs: filteredJobs.map((j) => {
          let parsedKeywords: string[] = [];
          if (j.keywords) {
            try {
              parsedKeywords = JSON.parse(j.keywords);
            } catch (e) {}
          }
          return {
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            industry: j.industry,
            sourceName: j.sourceName,
            sourceUrl: j.sourceUrl,
            matchScore: j.matchScore,
            status: j.status,
            postDateText: j.postDateText,
            createdAt: j.createdAt,
            analyzedAt: j.analyzedAt,
            isUnicorn: j.isUnicorn === 1,
            keywords: parsedKeywords,
            workplaceType: j.workplaceType ?? null,
          };
        }),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[getAnalytics] error:", error);
      return EMPTY(data.period ?? "all_time");
    }
  });

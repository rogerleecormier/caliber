import { getDb } from "@/db/db";
import { jobAnalyses, analyticsSummary, generatedDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { CloudflareEnv } from "@/lib/cloudflare";

interface KeywordCount { keyword: string; count: number }
interface TitleCount { title: string; count: number }
interface IndustryCount { industry: string; count: number }

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

function topN<T extends Record<string, unknown>>(arr: T[], key: keyof T, n: number): T[] {
  return arr
    .sort((a, b) => (b as Record<string, number>).count - (a as Record<string, number>).count)
    .slice(0, n);
}

export async function aggregateAnalytics(env: CloudflareEnv, userId?: number): Promise<void> {
  const db = getDb(env.DB);

  if (!userId) {
    const allUsers = await db.select({ userId: jobAnalyses.userId }).from(jobAnalyses);
    const uniqueIds = [...new Set(allUsers.map((u) => u.userId).filter((id): id is number => id !== null))];
    for (const uid of uniqueIds) {
      await aggregateAnalytics(env, uid);
    }
    return;
  }

  const allAnalyses = await db.select().from(jobAnalyses).where(eq(jobAnalyses.userId, userId));
  const now = new Date().toISOString();
  const period = "all_time";

  if (allAnalyses.length === 0) {
    const [existing] = await db
      .select()
      .from(analyticsSummary)
      .where(and(eq(analyticsSummary.period, period), eq(analyticsSummary.userId, userId)))
      .limit(1);

    const empty = {
      userId, period,
      topJdKeywords: JSON.stringify([]),
      topResumeKeywords: JSON.stringify([]),
      topJobTitles: JSON.stringify([]),
      topIndustries: JSON.stringify([]),
      averageMatchScore: 0,
      totalAnalyses: 0,
      totalResumesGenerated: 0,
      totalApplied: 0,
      totalPursued: 0,
      updatedAt: now,
    };
    if (existing) {
      await db.update(analyticsSummary).set(empty).where(eq(analyticsSummary.id, existing.id));
    } else {
      await db.insert(analyticsSummary).values(empty);
    }
    return;
  }

  // JD keywords
  const jdKeywordMap = new Map<string, number>();
  for (const a of allAnalyses) {
    const keywords: string[] = JSON.parse(a.keywords ?? "[]");
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      if (k) jdKeywordMap.set(k, (jdKeywordMap.get(k) ?? 0) + 1);
    }
  }
  const topJdKeywords: KeywordCount[] = topN(
    Array.from(jdKeywordMap.entries()).map(([keyword, count]) => ({ keyword, count })),
    "count", 20,
  );

  // Resume keywords (from generated docs for this user's analyses)
  const analysisIds = allAnalyses.map((a) => a.id);
  const allResumeDocs = (await db.select().from(generatedDocuments).where(eq(generatedDocuments.docType, "resume")))
    .filter((d) => analysisIds.includes(d.jobAnalysisId!));

  const resumeKeywordMap = new Map<string, number>();
  for (const doc of allResumeDocs) {
    const keywords: string[] = JSON.parse(doc.resumeKeywords ?? "[]");
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      if (k) resumeKeywordMap.set(k, (resumeKeywordMap.get(k) ?? 0) + 1);
    }
  }
  const topResumeKeywords: KeywordCount[] = topN(
    Array.from(resumeKeywordMap.entries()).map(([keyword, count]) => ({ keyword, count })),
    "count", 20,
  );

  // Top job titles / focus areas (applied only, normalized so near-identical titles roll up together)
  const titleMap = new Map<string, { count: number; displayTitle: string }>();
  for (const a of allAnalyses) {
    if (a.applied === 1) {
      const rawTitle = (a.jobTitle ?? "").trim();
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
  const topJobTitles: TitleCount[] = topN(
    Array.from(titleMap.values()).map(({ displayTitle, count }) => ({ title: displayTitle, count })),
    "count", 5,
  );

  // Top industries
  const industryMap = new Map<string, number>();
  for (const a of allAnalyses) {
    const industry = (a.industry ?? "").trim();
    if (industry) industryMap.set(industry, (industryMap.get(industry) ?? 0) + 1);
  }
  const topIndustries: IndustryCount[] = topN(
    Array.from(industryMap.entries()).map(([industry, count]) => ({ industry, count })),
    "count", 5,
  );

  const scores = allAnalyses.map((a) => a.matchScore).filter((s): s is number => s !== null);
  const averageMatchScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const payload = {
    userId, period,
    topJdKeywords: JSON.stringify(topJdKeywords),
    topResumeKeywords: JSON.stringify(topResumeKeywords),
    topJobTitles: JSON.stringify(topJobTitles),
    topIndustries: JSON.stringify(topIndustries),
    averageMatchScore: Math.round(averageMatchScore * 10) / 10,
    totalAnalyses: allAnalyses.length,
    totalResumesGenerated: allResumeDocs.length,
    totalApplied: allAnalyses.filter((a) => a.applied === 1).length,
    totalPursued: allAnalyses.filter((a) => a.pursue === 1).length,
    updatedAt: now,
  };

  const [existing] = await db
    .select()
    .from(analyticsSummary)
    .where(and(eq(analyticsSummary.period, period), eq(analyticsSummary.userId, userId)))
    .limit(1);

  if (existing) {
    await db.update(analyticsSummary).set(payload).where(eq(analyticsSummary.id, existing.id));
  } else {
    await db.insert(analyticsSummary).values(payload);
  }
}

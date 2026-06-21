'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getCloudflareEnvAsync, type CloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, normalizedJobs } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";
import { scrapeJobInternal } from "./scrape-job";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";
import {
  runAnalysisPipeline,
  buildResumeEvidenceText,
  cleanJobUrl,
} from "./analyze-job-pipeline";
import { canonicalizeJobUrl } from "@/lib/normalized-jobs-persistence";
import { scoreJobAgainstProfile } from "@/lib/ai/job-score";

export const analyzeJob = createServerFn({ method: "POST" })
  .inputValidator((data: { url?: string; jdText?: string; pipelineJobId?: number }) => {
    if (!data.url && !data.jdText?.trim()) throw new Error("A job URL or pasted job description text is required");
    if (data.url && !URL.canParse(data.url)) throw new Error("A valid URL is required");
    if (data.jdText && data.jdText.trim().length < 50) throw new Error("Job description text is too short");
    return data;
  })
  .handler(async (ctx: any) => { const { data } = ctx;
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database not available in development mode. Run with wrangler or deploy to Cloudflare.");
    const db = getDb(env.DB);

    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");

    const cleanedUrl = data.url ? cleanJobUrl(data.url) : "text-input";

    let jdText: string;
    if (data.jdText?.trim()) {
      jdText = data.jdText.trim();
    } else {
      const scraped = await scrapeJobInternal(data.url!);
      jdText = scraped.text;
    }

    const resumeRows = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
    if (!resumeRows.length) throw new Error("No master resume found. Please add your resume first.");
    const resumeRow = resumeRows[0];
    const resumeText = resumeRow.rawText ?? "";
    const resumeEvidenceText = buildResumeEvidenceText({
      rawText: resumeRow.rawText,
      summary: resumeRow.summary,
      competencies: resumeRow.competencies,
      tools: resumeRow.tools,
      certifications: resumeRow.certifications,
      experience: resumeRow.experience,
      education: resumeRow.education,
    });

    const analysis = await runAnalysisPipeline(jdText, resumeText, resumeEvidenceText, env);

    // Generate all 4 scores (ATS, Career, Outlook, Master)
    const scoreResult = await scoreJobAgainstProfile(
      env.AI,
      resumeText,
      {
        id: 'manual-analysis',
        title: analysis.jobTitle ?? 'Untitled',
        description: jdText,
      },
    );

    const now = new Date().toISOString();

    // Check if a normalized job already exists for this URL (from an agent)
    let normalizedJobId = data.pipelineJobId ?? null;
    const canonicalSourceUrl = canonicalizeJobUrl(cleanedUrl);

    if (!normalizedJobId && cleanedUrl !== 'text-input') {
      const [existing] = await db
        .select({ id: normalizedJobs.id })
        .from(normalizedJobs)
        .where(and(
          eq(normalizedJobs.userId, user.id),
          eq(normalizedJobs.canonicalSourceUrl, canonicalSourceUrl),
        ))
        .limit(1);
      if (existing) normalizedJobId = existing.id;
    }

    let insertedId: number;

    if (normalizedJobId) {
      // Update existing normalized job with analysis data
      await db
        .update(normalizedJobs)
        .set({
          jdText,
          matchScore: analysis.matchScore,
          atsScore: scoreResult.atsScore,
          careerScore: scoreResult.careerScore,
          outlookScore: scoreResult.outlookScore,
          masterScore: scoreResult.masterScore,
          atsReason: scoreResult.atsReason,
          careerReason: scoreResult.careerReason,
          outlookReason: scoreResult.outlookReason,
          isUnicorn: scoreResult.isUnicorn ? 1 : 0,
          unicornReason: scoreResult.unicornReason,
          gapAnalysis: JSON.stringify(analysis.gapAnalysis),
          recommendations: JSON.stringify(analysis.recommendations),
          pursue: analysis.pursue ? 1 : 0,
          pursueJustification: analysis.pursueJustification,
          keywords: JSON.stringify(analysis.keywords),
          strategyNote: analysis.strategyNote,
          personalInterest: analysis.personalInterest,
          careerAnalysis: JSON.stringify(analysis.careerAnalysis),
          insights: analysis.insights ? JSON.stringify(analysis.insights) : null,
          industry: analysis.industry ?? undefined,
          currentStage: 'Analyzed',
          analyzedAt: now,
          updatedAt: now,
        })
        .where(eq(normalizedJobs.id, normalizedJobId));
      insertedId = normalizedJobId;
    } else {
      // Insert new normalized job with full analysis
      const [inserted] = await db
        .insert(normalizedJobs)
        .values({
          userId: user.id,
          jobTitle: analysis.jobTitle ?? 'Untitled',
          employerName: analysis.company ?? 'Unknown',
          location: analysis.location ?? null,
          industry: analysis.industry ?? null,
          sourceUrl: cleanedUrl,
          canonicalSourceUrl,
          sourceOrigin: cleanedUrl === 'text-input' ? 'text-input' : 'manual',
          jdText,
          matchScore: analysis.matchScore,
          atsScore: scoreResult.atsScore,
          careerScore: scoreResult.careerScore,
          outlookScore: scoreResult.outlookScore,
          masterScore: scoreResult.masterScore,
          atsReason: scoreResult.atsReason,
          careerReason: scoreResult.careerReason,
          outlookReason: scoreResult.outlookReason,
          isUnicorn: scoreResult.isUnicorn ? 1 : 0,
          unicornReason: scoreResult.unicornReason,
          gapAnalysis: JSON.stringify(analysis.gapAnalysis),
          recommendations: JSON.stringify(analysis.recommendations),
          pursue: analysis.pursue ? 1 : 0,
          pursueJustification: analysis.pursueJustification,
          keywords: JSON.stringify(analysis.keywords),
          strategyNote: analysis.strategyNote,
          personalInterest: analysis.personalInterest,
          careerAnalysis: JSON.stringify(analysis.careerAnalysis),
          insights: analysis.insights ? JSON.stringify(analysis.insights) : null,
          currentStage: 'Analyzed',
          isFavorited: true,
          isFlagged: false,
          remoteType: 'fully_remote',
          discoveryTimestamp: now,
          lastSeenAt: now,
          analyzedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      insertedId = inserted.id;
    }

    aggregateAnalytics(env as CloudflareEnv, user.id).catch((e) => console.error("[analyzeJob] aggregateAnalytics error:", e));

    return { id: insertedId, ...analysis, ...scoreResult };
  });

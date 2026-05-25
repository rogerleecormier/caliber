'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, pipelineJobs } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";
import { scrapeJobInternal } from "./scrape-job";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";
import {
  runAnalysisPipeline,
  buildResumeEvidenceText,
  cleanJobUrl,
} from "./analyze-job-pipeline";
import { logSearchEvent } from "@/lib/pipeline-persistence";

export const analyzeJob = createServerFn({ method: "POST" })
  .inputValidator((data: { url?: string; jdText?: string; pipelineJobId?: number }) => {
    if (!data.url && !data.jdText?.trim()) throw new Error("A job URL or pasted job description text is required");
    if (data.url && !URL.canParse(data.url)) throw new Error("A valid URL is required");
    if (data.jdText && data.jdText.trim().length < 50) throw new Error("Job description text is too short");
    return data;
  })
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available in development mode. Run with wrangler or deploy to Cloudflare.");
    const db = getDb(env.DB);

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const cleanedUrl = data.url ? cleanJobUrl(data.url) : "text-input";

    // Log analysis start
    logSearchEvent({
      userId: user.id,
      eventType: 'analysis_started',
      platform: 'manual',
      message: `Analysis started for ${cleanedUrl === 'text-input' ? 'pasted text' : cleanedUrl}`,
      metadata: { url: cleanedUrl, pipelineJobId: data.pipelineJobId },
      level: 'info',
    }).catch(() => {});

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

    const now = new Date().toISOString();

    // Check if a pipeline job already exists for this URL (from an agent)
    let pipelineJobId = data.pipelineJobId ?? null;

    if (!pipelineJobId && cleanedUrl !== 'text-input') {
      const [existing] = await db
        .select({ id: pipelineJobs.id })
        .from(pipelineJobs)
        .where(and(
          eq(pipelineJobs.userId, user.id),
          eq(pipelineJobs.canonicalSourceUrl, cleanedUrl),
        ))
        .limit(1);
      if (existing) pipelineJobId = existing.id;
    }

    let insertedId: number;

    if (pipelineJobId) {
      // Update existing pipeline job with analysis data
      await db
        .update(pipelineJobs)
        .set({
          jdText,
          matchScore: analysis.matchScore,
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
          status: 'Analyzed',
          analyzedAt: now,
          updatedAt: now,
        })
        .where(eq(pipelineJobs.id, pipelineJobId));
      insertedId = pipelineJobId;
    } else {
      // Insert new pipeline job with full analysis
      const [inserted] = await db
        .insert(pipelineJobs)
        .values({
          userId: user.id,
          title: analysis.jobTitle ?? 'Untitled',
          company: analysis.company ?? 'Unknown',
          location: analysis.location ?? null,
          industry: analysis.industry ?? null,
          sourceUrl: cleanedUrl,
          canonicalSourceUrl: cleanedUrl,
          sourceName: cleanedUrl === 'text-input' ? 'Text Input' : 'Manual',
          jdText,
          matchScore: analysis.matchScore,
          gapAnalysis: JSON.stringify(analysis.gapAnalysis),
          recommendations: JSON.stringify(analysis.recommendations),
          pursue: analysis.pursue ? 1 : 0,
          pursueJustification: analysis.pursueJustification,
          keywords: JSON.stringify(analysis.keywords),
          strategyNote: analysis.strategyNote,
          personalInterest: analysis.personalInterest,
          careerAnalysis: JSON.stringify(analysis.careerAnalysis),
          insights: analysis.insights ? JSON.stringify(analysis.insights) : null,
          status: 'Analyzed',
          firstSeenAt: now,
          lastSeenAt: now,
          analyzedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      insertedId = inserted.id;
    }

    // Log analysis completion
    logSearchEvent({
      userId: user.id,
      eventType: 'analysis_completed',
      platform: 'manual',
      message: `Analysis completed for ${analysis.jobTitle ?? 'Untitled'} at ${analysis.company ?? 'Unknown'} — Match: ${analysis.matchScore}%`,
      metadata: {
        pipelineJobId: insertedId,
        matchScore: analysis.matchScore,
        pursue: analysis.pursue,
        jobTitle: analysis.jobTitle,
        company: analysis.company,
      },
      level: 'success',
    }).catch(() => {});

    aggregateAnalytics(env, user.id).catch((e) => console.error("[analyzeJob] aggregateAnalytics error:", e));

    return { id: insertedId, ...analysis };
  });

'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, jobAnalyses } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";
import { scrapeJobInternal } from "./scrape-job";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";
import {
  runAnalysisPipeline,
  buildResumeEvidenceText,
  cleanJobUrl,
} from "./analyze-job-pipeline";

export const analyzeJob = createServerFn({ method: "POST" })
  .inputValidator((data: { url?: string; jdText?: string }) => {
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
    const [inserted] = await db
      .insert(jobAnalyses)
      .values({
        userId: user.id,
        jobUrl: cleanedUrl,
        jobTitle: analysis.jobTitle,
        company: analysis.company,
        industry: analysis.industry,
        location: analysis.location,
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
        createdAt: now,
      })
      .returning();

    aggregateAnalytics(env, user.id).catch((e) => console.error("[analyzeJob] aggregateAnalytics error:", e));

    return { id: inserted.id, ...analysis };
  });

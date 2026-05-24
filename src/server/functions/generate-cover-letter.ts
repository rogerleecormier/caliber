'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, jobAnalyses, generatedDocuments } from "@/db/schema";
import {
  allocateTokenBudgets,
  callClaude,
  truncateToTokenBudget,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS,
} from "@/lib/ai-gateway";
import { COVER_LETTER_PROMPT, type CoverLetterContent } from "@/lib/ats-format";
import { generateCoverLetterPdf } from "@/lib/pdf";

const COVER_LETTER_OUTPUT_TOKEN_BUDGET = 3_072;
const COVER_LETTER_PROMPT_OVERHEAD_TOKENS = 3_500;
const COVER_LETTER_CONTEXT_TOKEN_BUDGET = Math.min(
  24_000,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS - COVER_LETTER_OUTPUT_TOKEN_BUDGET - COVER_LETTER_PROMPT_OVERHEAD_TOKENS,
);
const COVER_LETTER_MIN_SECTION_TOKENS = 2_500;

export const generateCoverLetter = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: number; extraGuidance?: string }) => data)
  .handler(async ({ data }) => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB || !env.R2) {
        throw new Error("Database and R2 storage not available in development mode. Deploy to Cloudflare Workers.");
      }

      const db = getDb(env.DB);
      const user = await resolveSessionUser();
      if (!user) throw new Error("Not authenticated");

      const [analysis] = await db
        .select()
        .from(jobAnalyses)
        .where(and(eq(jobAnalyses.id, data.analysisId), eq(jobAnalyses.userId, user.id)))
        .limit(1);
      if (!analysis) throw new Error("Analysis not found");

      const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
      if (!resume) throw new Error("No master resume found");

      const candidateData = JSON.stringify({
        fullName: resume.fullName,
        email: resume.email,
        phone: resume.phone,
        linkedin: resume.linkedin,
        website: resume.website,
        summary: resume.summary,
        competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
        tools: resume.tools ? JSON.parse(resume.tools) : [],
        experience: resume.experience ? JSON.parse(resume.experience) : [],
        education: resume.education ? JSON.parse(resume.education) : [],
        certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
      }, null, 2);

      const rawResumeText = resume.rawText ?? "";
      const [jobDescriptionBudget, rawResumeBudget] = allocateTokenBudgets(
        [analysis.jdText ?? "", rawResumeText],
        COVER_LETTER_CONTEXT_TOKEN_BUDGET,
        COVER_LETTER_MIN_SECTION_TOKENS,
      );
      const jobDescription = truncateToTokenBudget(analysis.jdText ?? "", jobDescriptionBudget, {
        marker: "\n...[job description truncated for cover letter budget]...\n",
        preserveHeadRatio: 0.7,
      });
      const rawResumeSource = truncateToTokenBudget(rawResumeText, rawResumeBudget, {
        marker: "\n...[resume text truncated for cover letter budget]...\n",
        preserveHeadRatio: 0.65,
      });

      const painPoints = [
        ...(analysis.gapAnalysis ? JSON.parse(analysis.gapAnalysis) : []),
        ...(analysis.recommendations ? JSON.parse(analysis.recommendations) : []),
      ].slice(0, 3).join(" | ");

      const extraGuidance = (data.extraGuidance ?? "").trim();

      const prompt = COVER_LETTER_PROMPT
        .replace("{candidateData}", candidateData)
        .replace("{rawResumeText}", rawResumeSource)
        .replace("{jobTitle}", analysis.jobTitle ?? "")
        .replace("{company}", analysis.company ?? "")
        .replace("{jobDescription}", jobDescription)
        .replace("{painPoints}", painPoints || "Improve operational efficiency and team performance")
        .replace("{extraGuidance}", extraGuidance || "None provided");

      const rawResponse = await callClaude(env, [
        { role: "system", content: "You are a JSON-only API. Output valid JSON and nothing else. No markdown, no prose, no code fences." },
        { role: "user", content: prompt },
      ], { maxTokens: COVER_LETTER_OUTPUT_TOKEN_BUDGET });

      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Failed to parse cover letter content");
      const letterContent: CoverLetterContent = JSON.parse(jsonMatch[0]);

      letterContent.candidateName = resume.fullName;
      letterContent.signoff = resume.fullName;

      const contactParts = [resume.email, resume.phone, resume.linkedin, resume.website].filter(Boolean);
      const contactInfo = contactParts.join(" | ");

      const pdfBytes = await generateCoverLetterPdf({
        ...letterContent,
        nameHeader: resume.fullName,
        contactInfo,
      });

      const timestamp = Date.now();
      const r2Key = `documents/${data.analysisId}/cover_letter_${timestamp}.pdf`;
      const fileName = `CoverLetter_${(analysis.company ?? "Company").replace(/\s+/g, "_")}_${(analysis.jobTitle ?? "Position").replace(/\s+/g, "_")}.pdf`;

      await env.R2.put(r2Key, pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { fileName },
      });

      const now = new Date().toISOString();
      const [doc] = await db
        .insert(generatedDocuments)
        .values({
          jobAnalysisId: data.analysisId,
          docType: "cover_letter",
          r2Key,
          fileName,
          createdAt: now,
        })
        .returning();

      return { documentId: doc.id, fileName, r2Key };
    } catch (error) {
      console.error("generateCoverLetter error:", error);
      throw error;
    }
  });

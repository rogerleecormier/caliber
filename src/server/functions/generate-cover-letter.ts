'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, normalizedJobs, generatedDocuments, resumeVectorIndex, resumeSections } from "@/db/schema";
import {
  allocateTokenBudgets,
  callClaude,
  truncateToTokenBudget,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS,
} from "@/lib/ai-gateway";
import { COVER_LETTER_PROMPT, type CoverLetterContent } from "@/lib/ats-format";
import { generateCoverLetterPdf } from "@/lib/pdf";
import { matchJobDescriptionToResume, formatGroundTruthContext } from "@/lib/resume-matching";
import type { ResumeEmbedding } from "@/lib/resume-embedding";
import { createZeroHallucinationSystemPrompt } from "@/lib/zero-hallucination-prompt";

const COVER_LETTER_OUTPUT_TOKEN_BUDGET = 3_072;
const COVER_LETTER_PROMPT_OVERHEAD_TOKENS = 3_500;
const COVER_LETTER_CONTEXT_TOKEN_BUDGET = Math.min(
  24_000,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS - COVER_LETTER_OUTPUT_TOKEN_BUDGET - COVER_LETTER_PROMPT_OVERHEAD_TOKENS,
);
const COVER_LETTER_MIN_SECTION_TOKENS = 2_500;

export const generateCoverLetter = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: number; extraGuidance?: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    try {
      const env = await getCloudflareEnvAsync();
      if (!env.DB || !env.R2 || !env.AI) {
        throw new Error("Database and R2 storage not available in development mode. Deploy to Cloudflare Workers.");
      }

      const db = getDb(env.DB);
      const user = await resolveSessionUser((ctx as any)?.request);
      if (!user) throw new Error("Not authenticated");

      const [analysis] = await db
        .select()
        .from(normalizedJobs)
        .where(and(eq(normalizedJobs.id, data.analysisId), eq(normalizedJobs.userId, user.id)))
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

      // AI-03: Fetch resume embeddings for semantic RAG matching
      let groundTruthContext = "";
      try {
        const vectors = await db
          .select()
          .from(resumeVectorIndex)
          .where(eq(resumeVectorIndex.userId, user.id));

        if (vectors.length > 0) {
          const embeddings: ResumeEmbedding[] = vectors.map((v) => ({
            vectorId: v.vectorId || "",
            text: v.chunkText,
            embedding: [], // Note: embeddings are stored in Vectorize, not in DB
            tokens: Math.ceil(v.chunkText.length * 0.25),
          }));

          const jobDesc = analysis.jdText ?? "";
          if (jobDesc.length > 0) {
            // Pre-filter job description against resume chunks
            const matched = await matchJobDescriptionToResume(env, jobDesc, embeddings);
            groundTruthContext = formatGroundTruthContext(matched);
          }
        }
      } catch (error) {
        console.warn("Failed to fetch ground truth context:", error);
        // Fallback: continue without semantic matching
      }

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

      // AI-03: Inject ground truth context (semantic RAG) into prompt with zero-hallucination constraint
      const groundTruthSection = groundTruthContext
        ? `\n\nGROUND TRUTH RESUME CONTEXT (verified semantic matches from master resume):\n${groundTruthContext}\n\nIMPERATIVE: Base all resume references on this context. Do not invent or extrapolate metrics, dates, or achievements.`
        : "";

      const prompt = COVER_LETTER_PROMPT
        .replace("{candidateData}", candidateData)
        .replace("{rawResumeText}", rawResumeSource + groundTruthSection)
        .replace("{jobTitle}", analysis.jobTitle ?? "")
        .replace("{company}", analysis.employerName ?? "")
        .replace("{jobDescription}", jobDescription)
        .replace("{painPoints}", painPoints || "Improve operational efficiency and team performance")
        .replace("{extraGuidance}", extraGuidance || "None provided");

      const systemPrompt = createZeroHallucinationSystemPrompt("json-only");

      const rawResponse = await callClaude(env, [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ], { maxTokens: COVER_LETTER_OUTPUT_TOKEN_BUDGET });

      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Failed to parse cover letter content");
      const parsed = JSON.parse(jsonMatch[0]);

      const letterContent: CoverLetterContent = {
        greeting: parsed.greeting || "Dear Hiring Manager",
        opening: parsed.opening || "I am writing to express my strong interest in the role.",
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets.filter((b: any) => b) : [],
        closing: parsed.closing || "Thank you for considering my application.",
        candidateName: resume.fullName || "Applicant",
        signoff: resume.fullName || "Applicant",
      };

      const contactParts = [resume.email, resume.phone, resume.linkedin, resume.website].filter(Boolean);
      const contactInfo = contactParts.join(" | ");

      const pdfBytes = await generateCoverLetterPdf({
        ...letterContent,
        nameHeader: resume.fullName,
        contactInfo,
      });

      const timestamp = Date.now();
      const r2Key = `documents/${data.analysisId}/cover_letter_${timestamp}.pdf`;
      const fileName = `CoverLetter_${(analysis.employerName ?? "Company").replace(/\s+/g, "_")}_${(analysis.jobTitle ?? "Position").replace(/\s+/g, "_")}.pdf`;

      await env.R2.put(r2Key, pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { fileName },
      });

      const now = new Date().toISOString();
      const [doc] = await db
        .insert(generatedDocuments)
        .values({
          pipelineJobId: data.analysisId,
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

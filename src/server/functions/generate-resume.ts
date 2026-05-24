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
import { RESUME_GENERATION_PROMPT, type AtsResumeContent } from "@/lib/ats-format";
import { generateResumePdf } from "@/lib/pdf";
import { jsonrepair } from "jsonrepair";

const RESUME_OUTPUT_TOKEN_BUDGET = 8_192;
const RESUME_PROMPT_OVERHEAD_TOKENS = 6_000;
const RESUME_CONTEXT_TOKEN_BUDGET = Math.min(
  36_000,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS - RESUME_OUTPUT_TOKEN_BUDGET - RESUME_PROMPT_OVERHEAD_TOKENS,
);
const RESUME_MIN_SECTION_TOKENS = 3_000;

const GUIDANCE_STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "were", "have", "has", "had", "will", "would", "should", "could", "about", "over", "under", "through", "while", "where", "when", "what", "which", "highlight", "bullet", "bullets", "specific", "certain", "topic", "topics",
]);

function selectExperienceForPrompt(
  experiences: unknown[],
  extraGuidance: string,
  jdKeywords: string[] = [],
  limit = 3,
): unknown[] {
  if (!Array.isArray(experiences) || experiences.length <= limit) {
    return Array.isArray(experiences) ? experiences : [];
  }

  const guidanceTerms = extraGuidance
    .toLowerCase()
    .split(/[^a-z0-9+.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !GUIDANCE_STOP_WORDS.has(token));

  const jdTerms = jdKeywords
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9+.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !GUIDANCE_STOP_WORDS.has(token));

  if (guidanceTerms.length === 0 && jdTerms.length === 0) {
    return experiences.slice(0, limit);
  }

  const scored = experiences.map((exp, index) => {
    const haystack = JSON.stringify(exp).toLowerCase();
    let relevance = 0;
    for (const term of guidanceTerms) {
      if (haystack.includes(term)) relevance += 10;
    }
    for (const term of jdTerms) {
      if (haystack.includes(term)) relevance += 5;
    }
    const recencyScore = Math.max(0, limit - index) * 0.5;
    return { index, score: relevance + recencyScore, exp };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.exp);
}

export const generateResume = createServerFn({ method: "POST" })
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

      const extraGuidance = (data.extraGuidance ?? "").trim();

      const allExperience: unknown[] = resume.experience ? JSON.parse(resume.experience) : [];
      let jdKeywords: string[] = [];
      try {
        const keywordData = analysis.keywords ? JSON.parse(analysis.keywords) : [];
        jdKeywords = Array.isArray(keywordData) ? keywordData : [];
      } catch {
        jdKeywords = [];
      }
      const selectedExperience = selectExperienceForPrompt(allExperience, extraGuidance, jdKeywords, 3);
      const experienceCount = selectedExperience.length;

      const candidateData = JSON.stringify({
        fullName: resume.fullName,
        email: resume.email,
        phone: resume.phone,
        linkedin: resume.linkedin,
        website: resume.website,
        summary: resume.summary,
        competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
        tools: resume.tools ? JSON.parse(resume.tools) : [],
        experience: selectedExperience,
        education: resume.education ? JSON.parse(resume.education) : [],
        certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
      }, null, 2);

      const rawResumeText = resume.rawText ?? "";
      const [jobDescriptionBudget, rawResumeBudget] = allocateTokenBudgets(
        [analysis.jdText ?? "", rawResumeText],
        RESUME_CONTEXT_TOKEN_BUDGET,
        RESUME_MIN_SECTION_TOKENS,
      );
      const jobDescription = truncateToTokenBudget(analysis.jdText ?? "", jobDescriptionBudget, {
        marker: "\n...[job description truncated for resume generation budget]...\n",
        preserveHeadRatio: 0.7,
      });
      const rawResumeSource = truncateToTokenBudget(rawResumeText, rawResumeBudget, {
        marker: "\n...[resume text truncated for resume generation budget]...\n",
        preserveHeadRatio: 0.65,
      });

      const prompt = RESUME_GENERATION_PROMPT
        .replace("{candidateData}", candidateData)
        .replace("{rawResumeText}", rawResumeSource)
        .replace("{jobTitle}", analysis.jobTitle ?? "")
        .replace("{company}", analysis.company ?? "")
        .replace("{jobDescription}", jobDescription)
        .replace("{keywords}", analysis.keywords ?? "[]")
        .replace("{experienceCount}", String(experienceCount))
        .replace("{extraGuidance}", extraGuidance || "None provided");

      const messages: Array<{ role: "system" | "user"; content: string }> = [
        { role: "system", content: "You are a JSON-only API. Output valid JSON and nothing else. No markdown, no prose, no code fences." },
        { role: "user", content: prompt },
      ];

      const parseResume = (raw: string): AtsResumeContent => {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Failed to extract JSON from resume generation response");
        return JSON.parse(jsonrepair(jsonMatch[0])) as AtsResumeContent;
      };

      const isResumeContentSparse = (content: AtsResumeContent): boolean => {
        const tooFewCompetencies = !content.coreCompetencies || content.coreCompetencies.length < 4;
        const tooFewSkillCategories = !content.technicalSkills || content.technicalSkills.length < 2;
        const missingExperience = !content.experience || content.experience.length === 0;
        return tooFewCompetencies || tooFewSkillCategories || missingExperience;
      };

      let rawResponse = await callClaude(env, messages, { maxTokens: RESUME_OUTPUT_TOKEN_BUDGET });
      let resumeContent = parseResume(rawResponse);

      if (isResumeContentSparse(resumeContent)) {
        console.warn(`[generateResume] Sparse result detected. Retrying…`);
        rawResponse = await callClaude(env, messages, { maxTokens: RESUME_OUTPUT_TOKEN_BUDGET });
        resumeContent = parseResume(rawResponse);
        if (isResumeContentSparse(resumeContent)) {
          console.error("[generateResume] Sparse result persisted after retry.");
        }
      }

      const pdfBytes = await generateResumePdf(resumeContent);

      const resumeKeywords: string[] = [];
      if (resumeContent.coreCompetencies) resumeKeywords.push(...resumeContent.coreCompetencies);
      if (resumeContent.technicalSkills) {
        for (const skillCategory of resumeContent.technicalSkills) {
          resumeKeywords.push(...skillCategory.skills);
        }
      }
      if (resumeContent.certifications) resumeKeywords.push(...resumeContent.certifications);
      const uniqueKeywords = Array.from(new Set(resumeKeywords.map((k) => k.toLowerCase().trim())))
        .filter((k) => k.length > 0)
        .slice(0, 50);

      const timestamp = Date.now();
      const r2Key = `documents/${data.analysisId}/resume_${timestamp}.pdf`;
      const fileName = `Resume_${(analysis.company ?? "Company").replace(/\s+/g, "_")}_${(analysis.jobTitle ?? "Position").replace(/\s+/g, "_")}.pdf`;

      await env.R2.put(r2Key, pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { fileName },
      });

      const now = new Date().toISOString();
      const [doc] = await db
        .insert(generatedDocuments)
        .values({
          jobAnalysisId: data.analysisId,
          docType: "resume",
          r2Key,
          fileName,
          resumeKeywords: JSON.stringify(uniqueKeywords),
          createdAt: now,
        })
        .returning();

      return { documentId: doc.id, fileName, r2Key };
    } catch (error) {
      console.error("generateResume error:", error);
      throw error;
    }
  });

'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, pipelineJobs, generatedDocuments, resumeSections } from "@/db/schema";
import {
  callClaude,
} from "@/lib/ai-gateway";
import { type AtsResumeContent } from "@/lib/ats-format";
import { generateResumePdf } from "@/lib/pdf";
import { jsonrepair } from "jsonrepair";
import {
  type SectionType,
  type SectionContent,
  parseSectionContent,
} from "@/lib/resume-sections";
import {
  SECTION_PROMPT_PROFESSIONAL_SUMMARY,
  SECTION_PROMPT_CORE_COMPETENCIES,
  SECTION_PROMPT_TECHNICAL_SKILLS,
  SECTION_PROMPT_PROFESSIONAL_EXPERIENCE,
  SECTION_PROMPT_PERSONAL_PROJECTS,
  SECTION_PROMPT_EDUCATION,
  SECTION_PROMPT_AWARDS,
} from "@/lib/resume-section-prompts";


function parseSectionResponse<T extends SectionType>(raw: string, sectionType: T): SectionContent[T] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Failed to extract JSON from ${sectionType} response`);
  const parsed = JSON.parse(jsonrepair(jsonMatch[0]));

  const sectionMap: Record<SectionType, (p: any) => any> = {
    professional_summary: (p) => p.professionalSummary ?? "",
    core_competencies: (p) => Array.isArray(p.coreCompetencies) ? p.coreCompetencies.filter((c: any) => c) : [],
    technical_skills: (p) => Array.isArray(p.technicalSkills) ? p.technicalSkills.filter((cat: any) => cat?.skills?.length > 0) : [],
    professional_experience: (p) => Array.isArray(p.experience) ? p.experience.filter((exp: any) => exp?.title && exp?.company) : [],
    personal_projects: (p) => Array.isArray(p.personalProjects) ? p.personalProjects.filter((proj: any) => proj?.name) : [],
    education: (p) => Array.isArray(p.education) ? p.education.filter((edu: any) => edu?.institution) : [],
    awards: (p) => Array.isArray(p.awards) ? p.awards.filter((a: any) => a) : [],
  };

  return sectionMap[sectionType](parsed);
}

async function tailorSection(
  env: any,
  sectionType: SectionType,
  currentContent: any,
  jobTitle: string,
  company: string,
  jobDescription: string,
  rawResumeText?: string,
): Promise<SectionContent[SectionType]> {
  const sectionPrompts: Record<SectionType, string> = {
    professional_summary: SECTION_PROMPT_PROFESSIONAL_SUMMARY,
    core_competencies: SECTION_PROMPT_CORE_COMPETENCIES,
    technical_skills: SECTION_PROMPT_TECHNICAL_SKILLS,
    professional_experience: SECTION_PROMPT_PROFESSIONAL_EXPERIENCE,
    personal_projects: SECTION_PROMPT_PERSONAL_PROJECTS,
    education: SECTION_PROMPT_EDUCATION,
    awards: SECTION_PROMPT_AWARDS,
  };

  let prompt = sectionPrompts[sectionType]
    .replace("{currentContent}", JSON.stringify(currentContent, null, 2))
    .replace("{jobTitle}", jobTitle)
    .replace("{company}", company)
    .replace("{jobDescription}", jobDescription);

  if (sectionType === "professional_experience" && rawResumeText) {
    prompt = prompt.replace("{rawResumeText}", rawResumeText);
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: "You are a JSON-only API. Output valid JSON and nothing else. No markdown, no prose, no code fences." },
    { role: "user", content: prompt },
  ];

  const response = await callClaude(env, messages, { maxTokens: 2048, temperature: 0.2 });
  return parseSectionResponse(response, sectionType);
}

export const generateResume = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: number; extraGuidance?: string }) => data)
  .handler(async ({ data }) => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB || !env.R2 || !env.AI) {
        throw new Error("Database, R2 storage, and AI binding not available. Please deploy to Cloudflare Workers.");
      }

      const db = getDb(env.DB);
      const user = await resolveSessionUser();
      if (!user) throw new Error("Not authenticated");

      const [analysis] = await db
        .select()
        .from(pipelineJobs)
        .where(and(eq(pipelineJobs.id, data.analysisId), eq(pipelineJobs.userId, user.id)))
        .limit(1);
      if (!analysis) throw new Error("Analysis not found");

      const jobTitle = analysis.title ?? "";
      const company = analysis.company ?? "";
      const jobDescription = analysis.jdText ?? "";

      // Try to fetch from section-based DB first
      let sections = await db
        .select()
        .from(resumeSections)
        .where(eq(resumeSections.userId, user.id));

      let sectionData: Partial<Record<SectionType, any>> = {};

      if (sections.length > 0) {
        // New section-based structure exists
        for (const section of sections) {
          const type = section.sectionType as SectionType;
          sectionData[type] = parseSectionContent(type, section.content);
        }
      } else {
        // Fallback to legacy masterResume table
        const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
        if (!resume) throw new Error("No master resume found");

        sectionData = {
          professional_summary: resume.summary ?? "",
          core_competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
          technical_skills: resume.tools ? JSON.parse(resume.tools) : [],
          professional_experience: resume.experience ? JSON.parse(resume.experience) : [],
          personal_projects: resume.personalProjects?.startsWith("[") ? JSON.parse(resume.personalProjects) : [],
          education: resume.education ? JSON.parse(resume.education) : [],
          awards: resume.certifications ? JSON.parse(resume.certifications) : [],
        };
      }

      // Fetch the master resume for contact info and rawText
      const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
      const rawResumeText = resume?.rawText ?? "";

      // Tailor each section
      const tailoredSections = await Promise.all([
        tailorSection(env, "professional_summary", sectionData.professional_summary || "", jobTitle, company, jobDescription),
        tailorSection(env, "core_competencies", sectionData.core_competencies || [], jobTitle, company, jobDescription),
        tailorSection(env, "technical_skills", sectionData.technical_skills || [], jobTitle, company, jobDescription),
        tailorSection(env, "professional_experience", sectionData.professional_experience || [], jobTitle, company, jobDescription, rawResumeText),
        tailorSection(env, "personal_projects", sectionData.personal_projects || [], jobTitle, company, jobDescription),
        tailorSection(env, "education", sectionData.education || [], jobTitle, company, jobDescription),
        tailorSection(env, "awards", sectionData.awards || [], jobTitle, company, jobDescription),
      ]);

      // Assemble tailored sections into AtsResumeContent
      const resumeContent: AtsResumeContent = {
        nameHeader: resume?.fullName ? `${resume.fullName} - ${jobTitle}` : "Candidate",
        contactInfo: `${resume?.email || ""}${resume?.phone ? " | " + resume.phone : ""}`.trim(),
        professionalSummary: tailoredSections[0] as string,
        coreCompetencies: tailoredSections[1] as string[],
        technicalSkills: tailoredSections[2] as AtsResumeContent["technicalSkills"],
        experience: tailoredSections[3] as AtsResumeContent["experience"],
        personalProjects: tailoredSections[4] as AtsResumeContent["personalProjects"],
        education: tailoredSections[5] as AtsResumeContent["education"],
        certifications: tailoredSections[6] as string[],
      };

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
      const fileName = `Resume_${(company).replace(/\s+/g, "_")}_${(jobTitle).replace(/\s+/g, "_")}.pdf`;

      await env.R2.put(r2Key, pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { fileName },
      });

      const now = new Date().toISOString();
      const [doc] = await db
        .insert(generatedDocuments)
        .values({
          pipelineJobId: data.analysisId,
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

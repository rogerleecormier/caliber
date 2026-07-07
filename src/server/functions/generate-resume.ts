'use server';
import { createServerFn } from "@tanstack/react-start";
import { resolveSessionUser } from "@/lib/resolve-user";
import { eq, and, sql } from "drizzle-orm";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, normalizedJobs, generatedDocuments, resumeSections } from "@/db/schema";
import {
  callClaude,
} from "@/lib/ai-gateway";
import { type AtsResumeContent } from "@/lib/ats-format";
import { generateResumePdf } from "@/lib/pdf";
import { generateResumeDocx } from "@/lib/docx";
import {
  type SectionType,
  type SectionContent,
  parseSectionContent,
} from "@/lib/resume-sections";
import {
  parseSectionResponse,
  getDefaultSectionValue,
  enforceGuardrails,
  formatPhoneNumber,
  looksLikePromptEcho,
} from "@/lib/resume-section-parsing";
import {
  SECTION_PROMPT_PROFESSIONAL_SUMMARY,
  SECTION_PROMPT_CORE_COMPETENCIES,
  SECTION_PROMPT_TECHNICAL_SKILLS,
  SECTION_PROMPT_PROFESSIONAL_EXPERIENCE,
  SECTION_PROMPT_PERSONAL_PROJECTS,
  SECTION_PROMPT_EDUCATION,
  SECTION_PROMPT_CERTIFICATIONS,
  SECTION_PROMPT_AWARDS,
} from "@/lib/resume-section-prompts";
import { RESUME_TAILORING_MODEL } from "@/lib/ai/types";


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
    certifications: SECTION_PROMPT_CERTIFICATIONS,
    awards: SECTION_PROMPT_AWARDS,
  };

  const basePrompt = sectionPrompts[sectionType];
  if (!basePrompt) {
    console.error(`[tailorSection] No prompt found for section type: ${sectionType}`);
    return getDefaultSectionValue(sectionType);
  }

  let prompt = basePrompt
    .replace("{currentContent}", JSON.stringify(currentContent, null, 2))
    .replace("{jobTitle}", jobTitle)
    .replace("{company}", company)
    .replace("{jobDescription}", jobDescription);

  if (sectionType === "professional_experience") {
    prompt = prompt.replace("{rawResumeText}", rawResumeText && rawResumeText.trim().length > 0 ? rawResumeText : "(not provided)");
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: "You are a JSON-only API. Output valid JSON and nothing else. No markdown, no prose, no code fences." },
    { role: "user", content: prompt },
  ];

  try {
    console.log(`[tailorSection] Tailoring ${sectionType}...`);
    console.log(`[tailorSection] Input content:`, JSON.stringify(currentContent).substring(0, 300));
    // Increase token budget: experience sections may need more tokens for multiple jobs
    const maxTokens = sectionType === "professional_experience" ? 4096 : 3072;
    const temperature = sectionType === "professional_summary" ? 0.5 : 0.2;
    const response = await callClaude(env, messages, { maxTokens, temperature, model: RESUME_TAILORING_MODEL });
    console.log(`[tailorSection] Raw response for ${sectionType}:`, response.substring(0, 500));
    const result = parseSectionResponse(response, sectionType);
    console.log(`[tailorSection] ${sectionType} parsed result:`, JSON.stringify(result).substring(0, 300));
    return result;
  } catch (err) {
    console.error(`[tailorSection] Error tailoring ${sectionType}:`, err);
    return getDefaultSectionValue(sectionType);
  }
}

export const generateResume = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: number; extraGuidance?: string }) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    try {
      const env = await getCloudflareEnvAsync();
      if (!env.DB || !env.R2 || !env.AI) {
        throw new Error("Database, R2 storage, and AI binding not available. Please deploy to Cloudflare Workers.");
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

      const jobTitle = analysis.jobTitle ?? "";
      const company = analysis.employerName ?? "";
      const jobDescription = analysis.jdText ?? "";

      // Try to fetch from section-based DB first
      let sections = await db
        .select()
        .from(resumeSections)
        .where(eq(resumeSections.userId, user.id));

      let sectionData: Partial<Record<SectionType, any>> = {};

      if (sections.length > 0) {
        // New section-based structure exists
        console.log(`[generateResume] Found ${sections.length} resume sections in DB`);
        for (const section of sections) {
          const type = section.sectionType as SectionType;
          const parsed = parseSectionContent(type, section.content);
          sectionData[type] = parsed;
          console.log(`[generateResume] Loaded ${type}:`, type === 'professional_summary' ? `"${parsed}".substring(0, 100)` : parsed?.length ?? 0, 'items');
        }
      } else {
        // Fallback to legacy masterResume table
        const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
        if (!resume) throw new Error("No master resume found");

        console.log(`[generateResume] Using legacy masterResume; summary length: ${resume.summary?.length || 0}`);
        sectionData = {
          professional_summary: resume.summary ?? "",
          core_competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
          technical_skills: resume.tools ? JSON.parse(resume.tools) : [],
          professional_experience: resume.experience ? JSON.parse(resume.experience) : [],
          personal_projects: resume.personalProjects?.startsWith("[") ? JSON.parse(resume.personalProjects) : [],
          education: resume.education ? JSON.parse(resume.education) : [],
          certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
          awards: [],
        };
      }

      console.log(`[generateResume] Section data prepared:`, Object.keys(sectionData).length, "sections");

      // Fetch the master resume for contact info and rawText
      const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
      const rawResumeText = resume?.rawText ?? "";

      // Tailor each section
      console.log(`[generateResume] About to tailor sections with data:`, {
        professional_summary: sectionData.professional_summary?.substring(0, 100) ?? "EMPTY",
        core_competencies: sectionData.core_competencies?.length ?? 0,
        technical_skills: sectionData.technical_skills?.length ?? 0,
      });

      // Tailor each section against the job description. If the AI call fails or
      // returns empty content, fall back to the original (guardrail-enforced) section.
      const sectionsToTailor: SectionType[] = [
        "professional_summary",
        "core_competencies",
        "technical_skills",
        "professional_experience",
        "personal_projects",
        "education",
        "certifications",
        "awards",
      ];

      const isEmptySection = (value: any): boolean => {
        if (value == null) return true;
        if (typeof value === "string") return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return false;
      };



      const tailoredSections: any[] = [];
      for (const sectionType of sectionsToTailor) {
        const original = sectionData[sectionType] ?? getDefaultSectionValue(sectionType);
        if (isEmptySection(original)) {
          tailoredSections.push(original);
          continue;
        }

        try {
          const tailored = await tailorSection(env, sectionType, original, jobTitle, company, jobDescription, rawResumeText);
          if (isEmptySection(tailored)) {
            console.warn(`[generateResume] Tailored ${sectionType} was empty, falling back to original`);
            tailoredSections.push(enforceGuardrails(sectionType, original));
          } else if (looksLikePromptEcho(tailored)) {
            console.warn(`[generateResume] Tailored ${sectionType} looks like prompt-instruction echo, falling back to original`);
            tailoredSections.push(enforceGuardrails(sectionType, original));
          } else {
            tailoredSections.push(tailored);
          }
        } catch (err) {
          console.error(`[generateResume] Failed to tailor ${sectionType}, falling back to original:`, err);
          tailoredSections.push(enforceGuardrails(sectionType, original));
        }
      }

      console.log(`[generateResume] Tailored sections received:`, {
        professional_summary: typeof tailoredSections[0] === 'string' ? tailoredSections[0].substring(0, 100) : tailoredSections[0],
        core_competencies: Array.isArray(tailoredSections[1]) ? tailoredSections[1].length : tailoredSections[1],
        technical_skills: Array.isArray(tailoredSections[2]) ? tailoredSections[2].length : tailoredSections[2],
      });

      // Format contact info with all available details
      const contactParts: string[] = [];
      if (resume?.email) contactParts.push(resume.email);
      if (resume?.phone) contactParts.push(formatPhoneNumber(resume.phone));
      if (resume?.linkedin) contactParts.push(resume.linkedin);
      if (resume?.website) contactParts.push(resume.website);
      const contactInfo = contactParts.join(" | ");

      // Assemble tailored sections into AtsResumeContent
      // Tailored sections order: [0]=summary, [1]=competencies, [2]=skills, [3]=experience, [4]=projects, [5]=education, [6]=certifications, [7]=awards
      const resumeContent: AtsResumeContent = {
        nameHeader: resume?.fullName || "Candidate",
        contactInfo: contactInfo,
        professionalSummary: (tailoredSections[0] as string) || "",
        coreCompetencies: (tailoredSections[1] as string[]) || [],
        technicalSkills: (tailoredSections[2] as AtsResumeContent["technicalSkills"]) || [],
        experience: (tailoredSections[3] as AtsResumeContent["experience"]) || [],
        personalProjects: (tailoredSections[4] as AtsResumeContent["personalProjects"]) || [],
        education: (tailoredSections[5] as AtsResumeContent["education"]) || [],
        certifications: (tailoredSections[6] as string[]) || [],
      };

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
      const baseName = `Resume_${company.replace(/\s+/g, "_")}_${jobTitle.replace(/\s+/g, "_")}`;
      const now = new Date().toISOString();

      // Generate both formats in parallel
      const [pdfBytes, docxBytes] = await Promise.all([
        generateResumePdf(resumeContent),
        generateResumeDocx(resumeContent),
      ]);

      const pdfKey = `documents/${data.analysisId}/resume_${timestamp}.pdf`;
      const docxKey = `documents/${data.analysisId}/resume_${timestamp}.docx`;
      const pdfName = `${baseName}.pdf`;
      const docxName = `${baseName}.docx`;

      await Promise.all([
        env.R2.put(pdfKey, pdfBytes, {
          httpMetadata: { contentType: "application/pdf" },
          customMetadata: { fileName: pdfName },
        }),
        env.R2.put(docxKey, docxBytes, {
          httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          customMetadata: { fileName: docxName },
        }),
      ]);

      const [pdfDoc, docxDoc] = await db
        .insert(generatedDocuments)
        .values([
          {
            pipelineJobId: data.analysisId,
            docType: "resume_pdf",
            r2Key: pdfKey,
            fileName: pdfName,
            resumeKeywords: JSON.stringify(uniqueKeywords),
            createdAt: now,
          },
          {
            pipelineJobId: data.analysisId,
            docType: "resume_docx",
            r2Key: docxKey,
            fileName: docxName,
            resumeKeywords: JSON.stringify(uniqueKeywords),
            createdAt: now,
          },
        ])
        .returning();

      // A resume was produced for this job — advance it to Prepped, but only
      // from Not Started/Analyzed so we don't regress a job already further along.
      await db
        .update(normalizedJobs)
        .set({ currentStage: sql`CASE WHEN ${normalizedJobs.currentStage} IN ('Not Started', 'Analyzed') THEN 'Prepped' ELSE ${normalizedJobs.currentStage} END`, updatedAt: now })
        .where(eq(normalizedJobs.id, data.analysisId));

      return {
        pdf: { documentId: pdfDoc.id, fileName: pdfName, r2Key: pdfKey },
        docx: { documentId: docxDoc.id, fileName: docxName, r2Key: docxKey },
      };
    } catch (error) {
      console.error("generateResume error:", error);
      throw error;
    }
  });

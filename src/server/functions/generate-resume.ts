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
  try {
    console.log(`[parseSectionResponse] Parsing ${sectionType}, raw response:`, raw.substring(0, 500));

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[parseSectionResponse] No JSON found in ${sectionType} response, returning default`);
      return getDefaultSectionValue(sectionType);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log(`[parseSectionResponse] JSON parse failed, attempting repair for ${sectionType}`);
      parsed = JSON.parse(jsonrepair(jsonMatch[0]));
    }

    console.log(`[parseSectionResponse] Parsed JSON for ${sectionType}:`, JSON.stringify(parsed).substring(0, 300));

    const sectionMap: Record<SectionType, (p: any) => any> = {
      professional_summary: (p) => {
        // Try multiple field name variations
        const result = p.professionalSummary ?? p.summary ?? p.professional_summary ?? "";
        console.log(`[parseSectionResponse] professional_summary result:`, result.substring(0, 100));
        return result;
      },
      core_competencies: (p) => {
        // Try multiple field name variations
        const competencies = p.coreCompetencies ?? p.competencies ?? p.core_competencies ?? [];
        const filtered = Array.isArray(competencies) ? competencies.filter((c: any) => c) : [];
        console.log(`[parseSectionResponse] core_competencies filtered:`, filtered.length, "items", filtered.slice(0, 3));
        return filtered;
      },
      technical_skills: (p) => {
        const skills = p.technicalSkills ?? p.technical_skills ?? p.skills ?? [];
        const filtered = Array.isArray(skills) ? skills.filter((cat: any) => cat?.skills?.length > 0) : [];
        console.log(`[parseSectionResponse] technical_skills filtered:`, filtered.length, "categories");
        return filtered;
      },
      professional_experience: (p) => Array.isArray(p.experience) ? p.experience.filter((exp: any) => exp?.title && exp?.company) : [],
      personal_projects: (p) => Array.isArray(p.personalProjects) ? p.personalProjects.filter((proj: any) => proj?.name) : [],
      education: (p) => Array.isArray(p.education) ? p.education.filter((edu: any) => edu?.institution) : [],
      awards: (p) => Array.isArray(p.awards) ? p.awards.filter((a: any) => a) : [],
    };

    let result = sectionMap[sectionType](parsed);
    result = enforceGuardrails(sectionType, result);
    console.log(`[parseSectionResponse] Final result for ${sectionType}:`, JSON.stringify(result).substring(0, 300));
    return result;
  } catch (err) {
    console.error(`[parseSectionResponse] Error parsing ${sectionType}:`, err);
    console.error(`Raw response was:`, raw.substring(0, 500));
    return getDefaultSectionValue(sectionType);
  }
}

function getDefaultSectionValue(sectionType: SectionType): any {
  const defaults: Record<SectionType, any> = {
    professional_summary: "",
    core_competencies: [],
    technical_skills: [],
    professional_experience: [],
    personal_projects: [],
    education: [],
    certifications: [],
    awards: [],
  };
  return defaults[sectionType];
}

function enforceGuardrails(sectionType: SectionType, content: any): any {
  switch (sectionType) {
    case "professional_summary": {
      // Enforce 3 sentences and ≤60 words
      let summary = content as string;
      if (!summary || summary.trim().length === 0) return "";

      // Count words
      const words = summary.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 60) {
        console.warn(`[enforceGuardrails] professional_summary exceeds 60 words (${words.length}), truncating`);
        summary = words.slice(0, 60).join(" ");
      }

      // Check sentence count (roughly by periods)
      const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length !== 3) {
        console.warn(`[enforceGuardrails] professional_summary has ${sentences.length} sentences, expected 3`);
      }

      return summary;
    }
    case "core_competencies": {
      // Enforce exactly 8 items
      const comps = Array.isArray(content) ? content : [];
      if (comps.length !== 8) {
        console.warn(`[enforceGuardrails] core_competencies has ${comps.length} items, expected 8`);
        if (comps.length < 8) {
          // Pad with empty strings if needed
          return [...comps, ...Array(8 - comps.length).fill("")].slice(0, 8);
        }
        return comps.slice(0, 8);
      }
      return comps;
    }
    case "technical_skills": {
      // Enforce 5-6 categories
      const skills = Array.isArray(content) ? content : [];
      if (skills.length < 5 || skills.length > 6) {
        console.warn(`[enforceGuardrails] technical_skills has ${skills.length} categories, expected 5-6`);
      }
      return skills;
    }
    default:
      return content;
  }
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
    certifications: SECTION_PROMPT_AWARDS,
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

  if (sectionType === "professional_experience" && rawResumeText) {
    prompt = prompt.replace("{rawResumeText}", rawResumeText);
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: "You are a JSON-only API. Output valid JSON and nothing else. No markdown, no prose, no code fences." },
    { role: "user", content: prompt },
  ];

  try {
    console.log(`[tailorSection] Tailoring ${sectionType}...`);
    console.log(`[tailorSection] Input content:`, JSON.stringify(currentContent).substring(0, 300));
    // Increase token budget: experience sections may need more tokens for multiple jobs
    const maxTokens = sectionType === "professional_experience" ? 4096 : 2048;
    const response = await callClaude(env, messages, { maxTokens, temperature: 0.2 });
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
          awards: resume.certifications ? JSON.parse(resume.certifications) : [],
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

      const tailoredSections = await Promise.all([
        tailorSection(env, "professional_summary", sectionData.professional_summary || "", jobTitle, company, jobDescription),
        tailorSection(env, "core_competencies", sectionData.core_competencies || [], jobTitle, company, jobDescription),
        tailorSection(env, "technical_skills", sectionData.technical_skills || [], jobTitle, company, jobDescription),
        tailorSection(env, "professional_experience", sectionData.professional_experience || [], jobTitle, company, jobDescription, rawResumeText),
        tailorSection(env, "personal_projects", sectionData.personal_projects || [], jobTitle, company, jobDescription),
        tailorSection(env, "education", sectionData.education || [], jobTitle, company, jobDescription),
        tailorSection(env, "certifications", sectionData.certifications || [], jobTitle, company, jobDescription),
        tailorSection(env, "awards", sectionData.awards || [], jobTitle, company, jobDescription),
      ]);

      console.log(`[generateResume] Tailored sections received:`, {
        professional_summary: typeof tailoredSections[0] === 'string' ? tailoredSections[0].substring(0, 100) : tailoredSections[0],
        core_competencies: Array.isArray(tailoredSections[1]) ? tailoredSections[1].length : tailoredSections[1],
        technical_skills: Array.isArray(tailoredSections[2]) ? tailoredSections[2].length : tailoredSections[2],
      });

      // Format contact info with all available details
      const contactParts: string[] = [];
      if (resume?.email) contactParts.push(resume.email);
      if (resume?.phone) contactParts.push(resume.phone);
      if (resume?.linkedin) contactParts.push(resume.linkedin);
      if (resume?.website) contactParts.push(resume.website);
      const contactInfo = contactParts.join(" | ");

      // Assemble tailored sections into AtsResumeContent
      // Use tailored version if it has content, otherwise fall back to original
      // Tailored sections order: [0]=summary, [1]=competencies, [2]=skills, [3]=experience, [4]=projects, [5]=education, [6]=certifications, [7]=awards
      const resumeContent: AtsResumeContent = {
        nameHeader: resume?.fullName || "Candidate",
        contactInfo: contactInfo,
        professionalSummary: (tailoredSections[0] as string)?.trim() || (sectionData.professional_summary || ""),
        coreCompetencies: (tailoredSections[1] as string[])?.length > 0 ? (tailoredSections[1] as string[]) : (sectionData.core_competencies || []),
        technicalSkills: (tailoredSections[2] as AtsResumeContent["technicalSkills"])?.length > 0 ? (tailoredSections[2] as AtsResumeContent["technicalSkills"]) : (sectionData.technical_skills || []),
        experience: (tailoredSections[3] as AtsResumeContent["experience"])?.length > 0 ? (tailoredSections[3] as AtsResumeContent["experience"]) : (sectionData.professional_experience || []),
        personalProjects: (tailoredSections[4] as AtsResumeContent["personalProjects"])?.length > 0 ? (tailoredSections[4] as AtsResumeContent["personalProjects"]) : (sectionData.personal_projects || []),
        education: (tailoredSections[5] as AtsResumeContent["education"])?.length > 0 ? (tailoredSections[5] as AtsResumeContent["education"]) : (sectionData.education || []),
        certifications: (tailoredSections[6] as string[])?.length > 0 ? (tailoredSections[6] as string[]) : (sectionData.certifications || []),
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

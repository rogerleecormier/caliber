'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, resumeSections } from "@/db/schema";
import { callWorkersAI } from "@/lib/ai-gateway";
import { RESUME_PARSING_MODEL } from "@/lib/ai/types";
import {
  JSON_ONLY_DIRECTIVE,
  RESUME_PARSE_AWARDS_PROMPT,
  RESUME_PARSE_CERTIFICATIONS_PROMPT,
  RESUME_PARSE_COMPETENCIES_PROMPT,
  RESUME_PARSE_EDUCATION_PROMPT,
  RESUME_PARSE_TECHNICAL_SKILLS_PROMPT,
} from "@/lib/ai/prompts";
import { type SectionType, serializeSectionContent, type TechnicalSkillCategory } from "@/lib/resume-sections";
import {
  splitExperienceIntoRoleChunks,
  splitProjectsIntoChunks,
  splitResumeIntoSections,
} from "@/lib/resume-section-splitter";
import { parseExperienceChunk, parseProjectChunk } from "@/lib/resume-entry-parsers";
import { isStructuredMarkdown, parseMarkdownResume } from "@/lib/resume-markdown-parser";
import { parseSectionResponse, SECTION_JSON_SCHEMAS, type SectionLabel } from "@/lib/resume-ai-response-parser";

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
}

export interface EducationEntry {
  degree: string;
  institution: string;
  graduationDate?: string;
  fieldOfStudy?: string;
}

export interface PersonalProjectEntry {
  name: string;
  description: string;
  technologies?: string[];
  url?: string;
}

export interface ResumeData {
  id?: number;
  fullName: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  competencies?: string[];
  tools?: string[];
  technicalSkills?: TechnicalSkillCategory[];
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
  certifications?: string[];
  awards?: string[];
  personalProjects?: PersonalProjectEntry[];
  rawText?: string;
  updatedAt?: string;
}

export const getResume = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResumeData | null> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) return null;
      const user = await resolveSessionUser();
      if (!user) return null;

      const db = getDb(env.DB);
      const [row] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
      if (!row) return null;

      return {
        id: row.id,
        fullName: row.fullName,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        linkedin: row.linkedin ?? undefined,
        website: row.website ?? undefined,
        summary: row.summary ?? undefined,
        competencies: row.competencies ? JSON.parse(row.competencies) : [],
        tools: row.tools ? JSON.parse(row.tools) : [],
        experience: row.experience ? JSON.parse(row.experience) : [],
        education: row.education ? JSON.parse(row.education) : [],
        certifications: row.certifications ? JSON.parse(row.certifications) : [],
        personalProjects: row.personalProjects?.startsWith("[") ? JSON.parse(row.personalProjects) : [],
        rawText: row.rawText ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
      };
    } catch (err) {
      console.error("[getResume] error:", err);
      return null;
    }
  },
);

export const saveResume = createServerFn({ method: "POST" })
  .inputValidator((data: ResumeData) => data)
  .handler(async ({ data }): Promise<{ success: boolean; updatedAt: string }> => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);
    const now = new Date().toISOString();

    const baseValues = {
      userId: user.id,
      fullName: data.fullName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      linkedin: data.linkedin ?? null,
      website: data.website ?? null,
      rawText: data.rawText ?? null,
      updatedAt: now,
    };

    // Only overwrite structured fields when explicitly provided — prevents a
    // contact-info-only save from clobbering AI-parsed experience/skills.
    const structuredValues = {
      ...(data.summary !== undefined && { summary: data.summary ?? null }),
      ...(data.competencies !== undefined && { competencies: JSON.stringify(data.competencies) }),
      ...(data.tools !== undefined && { tools: JSON.stringify(data.tools) }),
      ...(data.experience !== undefined && { experience: JSON.stringify(data.experience) }),
      ...(data.education !== undefined && { education: JSON.stringify(data.education) }),
      ...(data.certifications !== undefined && { certifications: JSON.stringify(data.certifications) }),
      ...(data.personalProjects !== undefined && { personalProjects: JSON.stringify(data.personalProjects) }),
    };

    try {
      await db
        .insert(masterResume)
        .values({ ...baseValues, ...structuredValues })
        .onConflictDoUpdate({
          target: masterResume.userId,
          set: { ...baseValues, ...structuredValues },
        });
    } catch (error) {
      const [existing] = await db
        .select({ id: masterResume.id })
        .from(masterResume)
        .where(eq(masterResume.userId, user.id))
        .limit(1);

      if (existing) {
        await db
          .update(masterResume)
          .set({ ...baseValues, ...structuredValues })
          .where(eq(masterResume.id, existing.id));
      } else {
        await db
          .insert(masterResume)
          .values({ ...baseValues, ...structuredValues });
      }

      console.warn("[saveResume] upsert failed; fallback update/insert path used", error);
    }

    return { success: true, updatedAt: now };
  });

function extractBasicFields(text: string): Partial<ResumeData> {
  const result: Partial<ResumeData> = {};

  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (firstLine && firstLine.trim().length < 80) result.fullName = firstLine.trim();

  const emailMatch = text.match(/[\w.+\-]+@[\w\-]+\.[\w.]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  const phoneMatch = text.match(/\(?\d{3}\)?[\s.\-•]\d{3}[\s.\-]\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/i);
  if (linkedinMatch) {
    result.linkedin = linkedinMatch[0].startsWith("http")
      ? linkedinMatch[0]
      : "https://" + linkedinMatch[0];
  }

  const urls = text.match(/https?:\/\/(?!(?:www\.)?linkedin\.com)[\w.\-]+\.[a-z]{2,}[/\w.\-?=&]*/gi);
  if (urls?.length) result.website = urls[0];

  return result;
}

export const parseResumeText = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => data)
  .handler(async ({ data }): Promise<Partial<ResumeData>> => {
    return extractBasicFields(data.text);
  });

// Normalize experience entries: ensure they have the correct field names
function normalizeExperience(exp: any[]): ExperienceEntry[] {
  return exp.map(e => ({
    title: e.title || '',
    company: e.company || '',
    dates: e.dates || (e.startDate || '') + (e.endDate ? ` - ${e.endDate}` : ''),
    bullets: Array.isArray(e.bullets) ? e.bullets : (e.description ? [e.description] : []),
  }));
}

/**
 * Calls the AI with a prompt scoped to a single resume section's text and
 * parses the JSON response. Returns null if the section text is empty or
 * the response can't be parsed.
 */
async function parseSectionWithAI(
  env: Parameters<typeof callWorkersAI>[0],
  systemPrompt: string,
  sectionText: string | undefined,
  label: SectionLabel,
  maxTokens = 4096,
): Promise<any | null> {
  if (!sectionText || !sectionText.trim()) return null;

  try {
    const raw = await callWorkersAI(
      env,
      [
        { role: "system", content: `${JSON_ONLY_DIRECTIVE}\n${systemPrompt}` },
        { role: "user", content: sectionText },
      ],
      {
        model: RESUME_PARSING_MODEL,
        maxTokens,
        temperature: 0.1,
        responseFormat: {
          type: "json_schema",
          json_schema: SECTION_JSON_SCHEMAS[label],
        },
      },
    );

    const result = parseSectionResponse(raw, label);
    if (!result) {
      console.error(`[aiParseResume] Could not extract data for ${label} from response:`, raw.slice(0, 300));
    }
    return result;
  } catch (err) {
    console.error(`[aiParseResume] Failed to parse ${label} section:`, err);
    return null;
  }
}

/**
 * Persists a map of section-type -> content into the resumeSections table for
 * the current user. Entries whose value is null are skipped (used to avoid
 * overwriting existing data when an AI extraction failed).
 */
async function writeResumeSections(
  sectionMap: Record<string, [SectionType, any] | null>,
): Promise<void> {
  try {
    const env = getCloudflareEnv();
    if (!env.DB) return;
    const db = getDb(env.DB);
    const sessionUser = await resolveSessionUser();
    if (!sessionUser) return;
    const now = new Date().toISOString();

    for (const entry of Object.values(sectionMap)) {
      if (!entry) continue;
      const [sectionType, content] = entry;
      const serialized = serializeSectionContent(sectionType, content);

      const existing = await db
        .select()
        .from(resumeSections)
        .where(
          and(
            eq(resumeSections.userId, sessionUser.id),
            eq(resumeSections.sectionType, sectionType),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(resumeSections)
          .set({ content: serialized, updatedAt: now })
          .where(eq(resumeSections.id, existing[0].id));
      } else {
        await db.insert(resumeSections).values({
          userId: sessionUser.id,
          sectionType,
          content: serialized,
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn("[writeResumeSections] Warning: Failed to write sections:", err);
  }
}

export const aiParseResume = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => data)
  .handler(async ({ data }): Promise<Partial<ResumeData>> => {
    const env = getCloudflareEnv();

    // Structured-markdown fast path: if the upload follows the documented
    // markdown schema (# name, ## sections, ### entries, etc.), parse it
    // deterministically — no AI, no PDF noise, fully verbatim.
    if (isStructuredMarkdown(data.text)) {
      console.log("[aiParseResume] Structured markdown detected — parsing deterministically");
      const md = parseMarkdownResume(data.text);

      const parsed_data: Partial<ResumeData> = {
        fullName: md.fullName,
        email: md.email,
        phone: md.phone,
        linkedin: md.linkedin,
        website: md.website,
        summary: md.summary,
        competencies: md.competencies.length > 0 ? md.competencies : undefined,
        tools: md.technicalSkills.flatMap((c) => c.skills),
        technicalSkills: md.technicalSkills,
        experience: md.experience.length > 0 ? md.experience : undefined,
        education: md.education.length > 0 ? md.education : undefined,
        certifications: md.certifications.length > 0 ? md.certifications : undefined,
        awards: md.awards.length > 0 ? md.awards : undefined,
        personalProjects: md.personalProjects.length > 0 ? md.personalProjects : undefined,
      };

      console.log("[aiParseResume] Markdown parsed:", {
        summary: md.summary ? `✓ (${md.summary.length} chars)` : "✗",
        competencies: md.competencies.length,
        technicalSkills: md.technicalSkills.length,
        experience: md.experience.length,
        education: md.education.length,
        certifications: md.certifications.length,
        awards: md.awards.length,
        personalProjects: md.personalProjects.length,
      });

      await writeResumeSections({
        summary: ["professional_summary", md.summary ?? ""],
        competencies: ["core_competencies", md.competencies],
        tools: ["technical_skills", md.technicalSkills],
        experience: ["professional_experience", md.experience],
        personalProjects: ["personal_projects", md.personalProjects],
        education: ["education", md.education],
        certifications: ["certifications", md.certifications],
        awards: ["awards", md.awards],
      });

      return parsed_data;
    }

    if (!env.AI) return {};

    try {
      console.log(`[aiParseResume] Parsing resume with ${data.text.length} characters`);

      const sections = splitResumeIntoSections(data.text);

      console.log('[aiParseResume] Detected sections:', Object.keys(sections));

      // Experience and Projects contain long verbatim text (bullets,
      // descriptions). Parse these DETERMINISTICALLY from the source — keeping
      // the bullet/description text exactly as written — instead of asking the
      // LLM to regenerate it (which is slow and hits Workers AI request
      // timeouts, AiError 3046). The text is copied, not regenerated, so it is
      // genuinely verbatim.
      const experienceChunks = sections.experience
        ? splitExperienceIntoRoleChunks(sections.experience)
        : [];
      const projectChunks = sections.personalProjects
        ? splitProjectsIntoChunks(sections.personalProjects)
        : [];

      console.log(
        `[aiParseResume] experience chunks: ${experienceChunks.length}, project chunks: ${projectChunks.length}`,
      );

      const experienceParsed = experienceChunks
        .map((chunk) => parseExperienceChunk(chunk))
        .filter((e): e is NonNullable<typeof e> => !!e && (!!e.title || (e.bullets?.length ?? 0) > 0));

      const projectsParsed = projectChunks
        .map((chunk) => parseProjectChunk(chunk))
        .filter((p): p is NonNullable<typeof p> => !!p && !!p.name);

      console.log(
        `[aiParseResume] experience entries: ${experienceParsed.length}, project entries: ${projectsParsed.length}`,
      );

      // Only the smaller list/structured sections still use the AI extractor.
      const [
        educationResult,
        technicalSkillsResult,
        competenciesResult,
        certificationsResult,
        awardsResult,
      ] = await Promise.all([
        parseSectionWithAI(env, RESUME_PARSE_EDUCATION_PROMPT, sections.education, "education"),
        parseSectionWithAI(env, RESUME_PARSE_TECHNICAL_SKILLS_PROMPT, sections.technicalSkills, "technicalSkills"),
        parseSectionWithAI(env, RESUME_PARSE_COMPETENCIES_PROMPT, sections.competencies, "competencies"),
        parseSectionWithAI(env, RESUME_PARSE_CERTIFICATIONS_PROMPT, sections.certifications, "certifications"),
        parseSectionWithAI(env, RESUME_PARSE_AWARDS_PROMPT, sections.awards, "awards"),
      ]);

      const experience = experienceParsed.length > 0
        ? normalizeExperience(experienceParsed)
        : undefined;

      const personalProjects = projectsParsed.length > 0 ? projectsParsed : undefined;

      const education = Array.isArray(educationResult?.education)
        ? educationResult.education.filter((e: any) => e.degree && e.institution)
        : undefined;

      const technicalSkills: TechnicalSkillCategory[] = Array.isArray(technicalSkillsResult?.technicalSkills)
        ? technicalSkillsResult.technicalSkills.filter(
            (c: any) => c.category && Array.isArray(c.skills) && c.skills.length > 0,
          )
        : [];

      const competencies: string[] = Array.isArray(competenciesResult?.competencies)
        ? competenciesResult.competencies.filter(Boolean)
        : [];

      const certifications: string[] = Array.isArray(certificationsResult?.certifications)
        ? certificationsResult.certifications.filter(Boolean)
        : [];

      const awards: string[] = Array.isArray(awardsResult?.awards)
        ? awardsResult.awards.filter(Boolean)
        : [];

      const parsed_data: Partial<ResumeData> = {
        summary: sections.summary ?? undefined,
        competencies: competencies.length > 0 ? competencies : undefined,
        tools: technicalSkills.flatMap((cat) => cat.skills),
        technicalSkills,
        experience,
        education,
        certifications: certifications.length > 0 ? certifications : undefined,
        awards: awards.length > 0 ? awards : undefined,
        personalProjects,
      };

      console.log('[aiParseResume] Parsed data:', {
        summary: parsed_data.summary ? `✓ (${parsed_data.summary.length} chars)` : '✗',
        competencies: parsed_data.competencies?.length ?? 0,
        competenciesList: parsed_data.competencies ?? [],
        technicalSkills: technicalSkills.length,
        technicalSkillsList: technicalSkills,
        experience: parsed_data.experience?.length ?? 0,
        education: parsed_data.education?.length ?? 0,
        certifications: parsed_data.certifications?.length ?? 0,
        awards: parsed_data.awards?.length ?? 0,
        personalProjects: parsed_data.personalProjects?.length ?? 0,
      });

      // For AI-derived sections, only write if either the resume had no such
      // section (legitimately empty) or the AI call succeeded — skip writing
      // when the section text existed but the AI call failed (returned null),
      // to avoid overwriting existing data with [].
      await writeResumeSections({
        summary: ["professional_summary", parsed_data.summary ?? ""],
        competencies: !sections.competencies || competenciesResult
          ? ["core_competencies", competencies]
          : null,
        tools: !sections.technicalSkills || technicalSkillsResult
          ? ["technical_skills", technicalSkills]
          : null,
        experience: ["professional_experience", experience ?? []],
        personalProjects: ["personal_projects", personalProjects ?? []],
        education: !sections.education || educationResult
          ? ["education", education ?? []]
          : null,
        certifications: !sections.certifications || certificationsResult
          ? ["certifications", certifications]
          : null,
        awards: !sections.awards || awardsResult
          ? ["awards", awards]
          : null,
      });

      return parsed_data;
    } catch (err) {
      console.error("[aiParseResume] error:", err);
      return {};
    }
  });

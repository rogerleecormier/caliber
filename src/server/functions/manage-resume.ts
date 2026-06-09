'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume, resumeSections } from "@/db/schema";
import { callWorkersAI } from "@/lib/ai-gateway";
import { RESUME_PARSE_PROMPT } from "@/lib/ai/prompts";
import { jsonrepair } from "jsonrepair";
import { type SectionType, serializeSectionContent } from "@/lib/resume-sections";

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

export const aiParseResume = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => data)
  .handler(async ({ data }): Promise<Partial<ResumeData>> => {
    const env = getCloudflareEnv();
    if (!env.AI) return {};

    try {
      console.log(`[aiParseResume] Parsing resume with ${data.text.length} characters`);

      // Gemma 4 26B supports 256K context
      // Set output tokens generously for full JSON parsing
      const raw = await callWorkersAI(
        env,
        [
          { role: "system", content: RESUME_PARSE_PROMPT },
          { role: "user", content: data.text },
        ],
        { maxTokens: 16000, temperature: 0.1 },
      );

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[aiParseResume] No JSON found in response');
        return {};
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = JSON.parse(jsonrepair(jsonMatch[0]));
      }

      console.log('[aiParseResume] Raw parsed from AI:', {
        summaryLength: parsed.summary?.length ?? 0,
        toolsCount: parsed.tools?.length ?? 0,
        toolsSample: parsed.tools?.slice(0, 5) ?? [],
        competenciesCount: parsed.competencies?.length ?? 0,
        experienceCount: parsed.experience?.length ?? 0,
      });

      // Normalize experience entries: ensure they have the correct field names
      const normalizeExperience = (exp: any[]): ExperienceEntry[] => {
        return exp.map(e => ({
          title: e.title || '',
          company: e.company || '',
          dates: e.dates || (e.startDate || '') + (e.endDate ? ` - ${e.endDate}` : ''),
          bullets: Array.isArray(e.bullets) ? e.bullets : (e.description ? [e.description] : []),
        }));
      };

      const parsed_data: Partial<ResumeData> = {
        summary: parsed.summary ?? undefined,
        competencies: Array.isArray(parsed.competencies) ? parsed.competencies.filter((c: any) => c) : undefined,
        tools: Array.isArray(parsed.tools) ? parsed.tools.filter((t: any) => t) : undefined,
        experience: Array.isArray(parsed.experience) ? normalizeExperience(parsed.experience) : undefined,
        education: Array.isArray(parsed.education) ? parsed.education.filter((e: any) => e.degree && e.institution) : undefined,
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications.filter((c: any) => c) : undefined,
        awards: Array.isArray(parsed.awards) ? parsed.awards.filter((a: any) => a) : undefined,
        personalProjects: Array.isArray(parsed.personalProjects) ? parsed.personalProjects.filter((p: any) => p.name) : undefined,
      };

      console.log('[aiParseResume] Parsed data:', {
        summary: parsed_data.summary ? '✓' : '✗',
        competencies: parsed_data.competencies?.length ?? 0,
        tools: parsed_data.tools?.length ?? 0,
        experience: parsed_data.experience?.length ?? 0,
        education: parsed_data.education?.length ?? 0,
        certifications: parsed_data.certifications?.length ?? 0,
        awards: parsed_data.awards?.length ?? 0,
        personalProjects: parsed_data.personalProjects?.length ?? 0,
      });

      // Write to the new section-based structure
      try {
        const env = getCloudflareEnv();
        if (env.DB) {
          const db = getDb(env.DB);
          const sessionUser = await resolveSessionUser();
          if (sessionUser) {
            const now = new Date().toISOString();

            // Transform flat tools array into categorized technical_skills
            const transformToolsToCategories = (tools: string[]) => {
              if (!Array.isArray(tools) || tools.length === 0) return [];
              // Group tools into a single "Tools & Technologies" category for now
              // (More sophisticated categorization can be added later)
              return [{ category: "Tools & Technologies", skills: tools }];
            };

            const toolsContent = transformToolsToCategories(parsed_data.tools ?? []);
            console.log('[aiParseResume] Transformed tools to categories:', {
              originalCount: parsed_data.tools?.length ?? 0,
              transformedContent: toolsContent,
            });

            const sectionMap: Record<string, [SectionType, any]> = {
              summary: ["professional_summary", parsed_data.summary ?? ""],
              competencies: ["core_competencies", parsed_data.competencies ?? []],
              tools: ["technical_skills", toolsContent],
              experience: ["professional_experience", parsed_data.experience ?? []],
              personalProjects: ["personal_projects", parsed_data.personalProjects ?? []],
              education: ["education", parsed_data.education ?? []],
              certifications: ["certifications", parsed_data.certifications ?? []],
              awards: ["awards", parsed_data.awards ?? []],
            };

            for (const [key, [sectionType, content]] of Object.entries(sectionMap)) {
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
                  .set({
                    content: serialized,
                    updatedAt: now,
                  })
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
          }
        }
      } catch (err) {
        console.warn("[aiParseResume] Warning: Failed to write sections, continuing with legacy storage:", err);
      }

      return parsed_data;
    } catch (err) {
      console.error("[aiParseResume] error:", err);
      return {};
    }
  });

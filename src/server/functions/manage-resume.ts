'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { masterResume } from "@/db/schema";
import { callWorkersAI } from "@/lib/ai-gateway";

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description?: string;
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
        personalProjects: row.personalProjects ? JSON.parse(row.personalProjects) : [],
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

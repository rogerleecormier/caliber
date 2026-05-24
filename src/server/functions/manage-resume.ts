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
    };

    await db
      .insert(masterResume)
      .values({ ...baseValues, ...structuredValues })
      .onConflictDoUpdate({
        target: [masterResume.userId],
        set: { ...baseValues, ...structuredValues },
      });

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
    const regexFields = extractBasicFields(data.text);

    const env = getCloudflareEnv();
    if (!env.AI) return regexFields;

    // Send the full resume text — Llama 3.3 70B handles long context well.
    // Typical resumes are 3-8K chars; even 4-page resumes fit easily.
    const resumeText = data.text;

    const system = `You are an expert resume parser that outputs ONLY valid JSON.
Extract ALL information from the resume and output a single JSON object.
Do not output any text before or after the JSON.
Do not use markdown code fences.

IMPORTANT: Extract COMPLETE details — include ALL bullet points, achievements, metrics, numbers, percentages, and quantifiable results for each experience entry. The description field for each experience entry should contain ALL bullet points/achievements from that role, separated by newlines.

CERTIFICATIONS: Extract EVERY certification mentioned in the resume, including abbreviated names with special characters like CompTIA A+, Network+, Security+, CCNA, PMP, ITIL, AWS Certified, etc. Do NOT skip any certifications.

SUMMARY: Extract the FULL professional summary or objective statement — do not truncate or shorten it.

TOOLS & METHODOLOGIES: Extract ALL tools, technologies, platforms, methodologies, and frameworks mentioned in the resume. This includes: programming languages, cloud platforms (AWS, Azure, GCP), databases, frameworks, libraries, software (Jira, Asana, Smartsheet, Monday.com, etc.), project management tools, methodologies (Agile, Scrum, Kanban, Waterfall, Hybrid, SAFe, etc.), and any other technologies or approaches explicitly mentioned. Be comprehensive — include tools mentioned in job descriptions, achievements, and skills sections.

Use these exact keys (omit any you cannot find):
fullName, email, phone, linkedin, website, summary,
competencies (array of strings — include ALL skills, competencies, and domain expertise areas mentioned in the resume, including soft skills, technical competencies, methodologies, and leadership areas),
tools (array of strings — include ALL technical tools, technologies, platforms, software, PM tools, methodologies, and frameworks explicitly mentioned in the resume),
certifications (array of strings — include EVERY certification, license, or credential mentioned ANYWHERE in the resume),
experience (array of {title,company,startDate,endDate,description} — description should contain ALL bullet points/details for that role),
education (array of {degree,institution,fieldOfStudy,graduationDate}).

Example output:
{"fullName":"Jane Smith","email":"jane@example.com","competencies":["Leadership","Project Management","Agile","Strategic Planning","Team Development"],"tools":["Python","AWS","Kubernetes","Terraform","Jira","Asana","Agile","Scrum","SAFe","Docker"],"certifications":["PMP","CompTIA Network+","AWS Solutions Architect"],"experience":[{"title":"Senior Engineer","company":"Acme Corp","startDate":"2020","endDate":"Present","description":"Led migration of 15 microservices to AWS, reducing infrastructure costs by 40%\\nManaged team of 8 engineers delivering $2M platform rebuild\\nImplemented CI/CD pipeline reducing deployment time from 4 hours to 15 minutes"}],"education":[{"degree":"B.S.","institution":"State U","fieldOfStudy":"CS","graduationDate":"2018"}]}`;

    try {
      const raw = await callWorkersAI(env, [
        { role: "system", content: system },
        { role: "user", content: `Parse this resume:\n\n${resumeText}` },
      ], { maxTokens: 8192 });

      const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
      const start = rawStr.indexOf("{");
      const end = rawStr.lastIndexOf("}");

      if (start === -1 || end === -1 || end <= start) {
        return regexFields;
      }

      const parsed = JSON.parse(rawStr.slice(start, end + 1)) as Partial<ResumeData>;

      // Merge: regex wins for contact fields (more reliable), AI wins for rich fields
      return {
        ...regexFields,
        ...parsed,
        fullName: parsed.fullName || regexFields.fullName,
        email:    parsed.email    || regexFields.email,
        phone:    parsed.phone    || regexFields.phone,
        linkedin: parsed.linkedin || regexFields.linkedin,
        website:  parsed.website  || regexFields.website,
      };
    } catch (err) {
      console.error("[parseResumeText] AI parse failed:", err);
      return regexFields;
    }
  });

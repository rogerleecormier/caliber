'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { masterResume } from "@/db/schema";
import { analyzeJobInsights } from "@/lib/ai";
import { allocateTokenBudgets, callWorkersAI, truncateToTokenBudget } from "@/lib/ai-gateway";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

// Source-agnostic job shape used by the result card. Works for any canonical job.
export type JobInsightInput = {
  title: string;
  company: string;
  location?: string | null;
  salary?: string | null;
  snippet?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
};

function buildJobContext(job: JobInsightInput) {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.salary ? `Listed salary: ${job.salary}` : null,
    job.sourceUrl ? `Source URL: ${job.sourceUrl}` : null,
    job.description ? `Description:\n${job.description}` : job.snippet ? `Snippet:\n${job.snippet}` : null,
  ].filter(Boolean).join("\n\n");
}

function buildResumeProfile(resume: typeof masterResume.$inferSelect) {
  return JSON.stringify({
    fullName: resume.fullName,
    summary: resume.summary,
    competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
    tools: resume.tools ? JSON.parse(resume.tools) : [],
    experience: resume.experience ? JSON.parse(resume.experience) : [],
    certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
    rawText: resume.rawText,
  }, null, 2);
}

// Inline salary/work-life/remote/seniority/red-flag insights for a single job.
export const getJobInsights = createServerFn({ method: "POST" })
  .inputValidator((data: JobInsightInput) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.AI) throw new Error("Workers AI binding not available.");

    const jobContext = buildJobContext(data);
    if (jobContext.length < 50) throw new Error("Not enough job text to generate insights.");

    const insights = await analyzeJobInsights(env, jobContext, data.title);
    return { ...insights, listedSalary: data.salary ?? null };
  });

// Draft a concise outreach message grounded in the resume + job.
export const generateJobOutreach = createServerFn({ method: "POST" })
  .inputValidator((data: JobInsightInput) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.DB || !env.AI) throw new Error("Database and Workers AI bindings are required.");

    const db = getDb(env.DB);
    const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
    if (!resume) throw new Error("No master resume found.");

    const candidateProfile = buildResumeProfile(resume);
    const jobContext = buildJobContext(data);
    const [resumeBudget, jobBudget] = allocateTokenBudgets([candidateProfile, jobContext], 10_000, 1_000);
    const prompt = `Draft a concise direct message for the candidate to send a recruiter/hiring manager about this role.

Rules:
- Maximum 650 characters.
- Write in first person.
- Mention the role and company naturally.
- Ground the message only in the candidate profile and job context.
- No placeholders, no subject line, no markdown.
- Sound warm, specific, and professional.

CANDIDATE PROFILE:
${truncateToTokenBudget(candidateProfile, resumeBudget, { marker: "\n...[resume truncated]...\n" })}

JOB CONTEXT:
${truncateToTokenBudget(jobContext, jobBudget, { marker: "\n...[job truncated]...\n" })}`;

    const message = await callWorkersAI(env, [
      { role: "system", content: "You write concise, high-converting professional outreach. Output only the message text." },
      { role: "user", content: prompt },
    ], { maxTokens: 400 });

    return { message: message.trim().replace(/^["']|["']$/g, "") };
  });

// Suggest adjacent/pivot job titles grounded in the resume (for agent criteria expansion).
export const suggestRelatedJobTitles = createServerFn({ method: "POST" })
  .inputValidator((data: { currentTitle?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.DB || !env.AI) throw new Error("Database and Workers AI bindings are required.");

    const db = getDb(env.DB);
    const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, user.id)).limit(1);
    if (!resume) throw new Error("No master resume found.");

    const resumeSnippet = truncateToTokenBudget(buildResumeProfile(resume), 8_000, {
      marker: "\n...[resume truncated for semantic title expansion]...\n",
      preserveHeadRatio: 0.7,
    });

    const prompt = `Suggest ${data.limit ?? 3} parallel industry or pivot job titles for a job search.

Rules:
- Use the candidate's resume evidence.
- Prefer adjacent titles that would plausibly fit the candidate, not fantasy roles.
- Avoid duplicating the current query/title.
- Return ONLY JSON: {"titles":["title one","title two","title three"]}

Current search title/query: ${data.currentTitle?.trim() || "Not provided"}

Candidate resume:
${resumeSnippet}`;

    const raw = await callWorkersAI(env, [
      { role: "system", content: "You are a job-search strategist. Output valid JSON only." },
      { role: "user", content: prompt },
    ], { maxTokens: 500 });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return semantic title JSON.");
    const parsed = JSON.parse(jsonMatch[0]) as { titles?: unknown };
    const requestedLimit = Math.max(1, Math.min(5, data.limit ?? 3));
    const current = (data.currentTitle ?? "").trim().toLowerCase();
    const titles = Array.isArray(parsed.titles)
      ? parsed.titles
          .filter((title): title is string => typeof title === "string")
          .map((title) => title.trim())
          .filter((title) => title.length > 1 && title.toLowerCase() !== current)
          .slice(0, requestedLimit)
      : [];

    return { titles };
  });

'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { masterResume } from "@/db/schema";
import { analyzeJobInsights } from "@/lib/ai";
import {
  allocateTokenBudgets,
  callWorkersAI,
  truncateToTokenBudget,
} from "@/lib/ai-gateway";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";
import type { LinkedInSearchParams } from "@/lib/linkedin-search";
import {
  bulkDeleteLinkedinJobs,
  bulkUpdateLinkedinJobStatus,
  deleteLinkedinSavedSearch,
  getLinkedinSettings,
  listLinkedinHistory,
  listSavedLinkedinSearches,
  saveLinkedinSearchDefinition,
  setLinkedinSavedSearchActive,
  updateLinkedinJobStatus,
  type LinkedinJobStatus,
} from "@/lib/linkedin-persistence";

type LinkedinCardJobInput = {
  title: string;
  company: string;
  location?: string | null;
  salary?: string | null;
  snippet?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
};

function buildLinkedinJobContext(job: LinkedinCardJobInput) {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.salary ? `Listed salary: ${job.salary}` : null,
    job.sourceUrl ? `Source URL: ${job.sourceUrl}` : null,
    job.description ? `Description:\n${job.description}` : job.snippet ? `Snippet:\n${job.snippet}` : null,
  ].filter(Boolean).join("\n\n");
}

export const getSavedLinkedinSearches = createServerFn({ method: "GET" }).handler(async () => {
  const user = await resolveSessionUser();
  if (!user) throw new Error("Not authenticated");
  return listSavedLinkedinSearches(user.id);
});

export const getLinkedinCronInfo = createServerFn({ method: "GET" }).handler(async () => {
  const user = await resolveSessionUser();
  if (!user) throw new Error("Not authenticated");
  const settings = await getLinkedinSettings();
  return {
    cronFrequency: settings.linkedinSearchCronFrequency,
    cronStartHour: settings.linkedinCronStartHour,
    cronVarianceMinutes: settings.linkedinCronVarianceMinutes,
  };
});

export const saveLinkedinSearch = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id?: number;
    name: string;
    criteria: LinkedInSearchParams;
    isActive?: boolean;
    runIntervalHours?: number;
    sources?: string[];
  }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    if (!data.name.trim()) throw new Error("Search name is required");
    const id = await saveLinkedinSearchDefinition({
      userId: user.id,
      id: data.id,
      name: data.name,
      criteria: data.criteria,
      isActive: data.isActive,
      runIntervalHours: data.runIntervalHours,
      sources: data.sources,
    });
    return { success: true, id };
  });

export const removeLinkedinSearch = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    await deleteLinkedinSavedSearch(data.id, user.id);
    return { success: true };
  });

export const toggleLinkedinSearchCron = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isActive: boolean }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    await setLinkedinSavedSearchActive(data.id, user.id, data.isActive);
    return { success: true };
  });

export const getLinkedinJobHistory = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      page?: number;
      pageSize?: number;
      query?: string;
      remote?: boolean;
      green?: boolean;
      sortBy?: string;
      status?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return listLinkedinHistory({
      user,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 20,
      query: data.query,
      remote: data.remote,
      green: data.green,
      sortBy: data.sortBy,
      status: data.status,
    });
  });

export const setLinkedinJobStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: LinkedinJobStatus }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return updateLinkedinJobStatus({ user, id: data.id, status: data.status });
  });

export const archiveLinkedinJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return bulkUpdateLinkedinJobStatus({ user, ids: data.ids, status: "Archived" });
  });

export const deleteLinkedinJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    return bulkDeleteLinkedinJobs({ user, ids: data.ids });
  });

export const getLinkedinInlineInsights = createServerFn({ method: "POST" })
  .inputValidator((data: LinkedinCardJobInput) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.AI) throw new Error("Workers AI binding not available.");

    const jobContext = buildLinkedinJobContext(data);
    if (jobContext.length < 50) throw new Error("Not enough job text to generate insights.");

    const insights = await analyzeJobInsights(env, jobContext, data.title);
    return {
      ...insights,
      listedSalary: data.salary ?? null,
    };
  });

export const generateLinkedinOutreach = createServerFn({ method: "POST" })
  .inputValidator((data: LinkedinCardJobInput) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.DB || !env.AI) throw new Error("Database and Workers AI bindings are required.");

    const db = getDb(env.DB);
    const [resume] = await db
      .select()
      .from(masterResume)
      .where(eq(masterResume.userId, user.id))
      .limit(1);
    if (!resume) throw new Error("No master resume found.");

    const candidateProfile = JSON.stringify({
      fullName: resume.fullName,
      summary: resume.summary,
      competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
      tools: resume.tools ? JSON.parse(resume.tools) : [],
      experience: resume.experience ? JSON.parse(resume.experience) : [],
      certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
      rawText: resume.rawText,
    }, null, 2);

    const jobContext = buildLinkedinJobContext(data);
    const [resumeBudget, jobBudget] = allocateTokenBudgets([candidateProfile, jobContext], 10_000, 1_000);
    const prompt = `Draft a concise LinkedIn direct message for the candidate to send about this role.

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

export const suggestLinkedinSemanticTitles = createServerFn({ method: "POST" })
  .inputValidator((data: { currentTitle?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.DB || !env.AI) throw new Error("Database and Workers AI bindings are required.");

    const db = getDb(env.DB);
    const [resume] = await db
      .select()
      .from(masterResume)
      .where(eq(masterResume.userId, user.id))
      .limit(1);
    if (!resume) throw new Error("No master resume found.");

    const resumeProfile = JSON.stringify({
      summary: resume.summary,
      competencies: resume.competencies ? JSON.parse(resume.competencies) : [],
      tools: resume.tools ? JSON.parse(resume.tools) : [],
      experience: resume.experience ? JSON.parse(resume.experience) : [],
      certifications: resume.certifications ? JSON.parse(resume.certifications) : [],
      rawText: resume.rawText,
    }, null, 2);

    const resumeSnippet = truncateToTokenBudget(resumeProfile, 8_000, {
      marker: "\n...[resume truncated for semantic title expansion]...\n",
      preserveHeadRatio: 0.7,
    });

    const prompt = `Suggest ${data.limit ?? 3} parallel industry or pivot job titles for LinkedIn search.

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

export const setSearchAgentRunning = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isRunning: boolean }) => data)
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const env = getCloudflareEnv();
    if (!env.KV) return { success: false };
    const lockKey = `user:${user.id}:agent:${data.id}:running`;
    if (data.isRunning) {
      await env.KV.put(lockKey, "true", { expirationTtl: 300 });
    } else {
      await env.KV.delete(lockKey);
    }
    return { success: true };
  });

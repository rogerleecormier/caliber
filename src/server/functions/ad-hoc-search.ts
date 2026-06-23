'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { JobAggregatorService } from "@/lib/services";
import { searchAtsJobs } from "@/lib/ats-search";
import type { LinkedInScrapedJob, LinkedInSearchParams } from "@/lib/linkedin-search";
import { resolveSessionUser } from "@/lib/resolve-user";
import { saveSearchConfiguration } from "@/lib/normalized-jobs-persistence";

export const ALL_AD_HOC_SOURCES = [
  'adzuna', 'jooble', 'remotive', 'remoteok', 'jobicy', 'greenhouse', 'lever',
] as const;
export type AdHocSource = (typeof ALL_AD_HOC_SOURCES)[number];

// Keep for backwards compat (agents-search-drawer still imports this)
export const AD_HOC_SOURCES = ALL_AD_HOC_SOURCES;

export interface AdHocSearchParams {
  keywords: string;
  location?: string;
  remote?: boolean;
  salaryMin?: number | null;
  workplaceTypes?: LinkedInSearchParams["workplaceTypes"];
  employmentTypes?: string[];
  limit?: number;
}

export interface AdHocSearchResult {
  jobs: LinkedInScrapedJob[];
  sources: Record<string, { success: boolean; count: number; error?: string }>;
}

// Keyword → best-fit RemoteOK tag
function keywordsToRemoteOKTag(keywords: string): string {
  const kw = keywords.toLowerCase();
  if (kw.includes('frontend') || kw.includes('front-end') || kw.includes('react') || kw.includes('vue') || kw.includes('angular')) return 'frontend';
  if (kw.includes('backend') || kw.includes('back-end') || kw.includes('node') || kw.includes('django') || kw.includes('rails')) return 'backend';
  if (kw.includes('fullstack') || kw.includes('full-stack') || kw.includes('full stack')) return 'fullstack';
  if (kw.includes('devops') || kw.includes('sre') || kw.includes('infra') || kw.includes('kubernetes') || kw.includes('terraform')) return 'devops';
  if (kw.includes('data') || kw.includes('analyst') || kw.includes('ml') || kw.includes('machine learning')) return 'data';
  if (kw.includes('design') || kw.includes('ux') || kw.includes('ui ')) return 'design';
  if (kw.includes('product') || kw.includes('pm ') || kw.includes('product manager')) return 'product';
  if (kw.includes('marketing')) return 'marketing';
  if (kw.includes('cloud') || kw.includes('aws') || kw.includes('azure') || kw.includes('gcp')) return 'cloud';
  if (kw.includes('support') || kw.includes('customer success')) return 'support';
  if (kw.includes('engineer') || kw.includes('software')) return 'engineer';
  return 'dev';
}

// Keyword → best-fit Jobicy industry
function keywordsToJobicyIndustry(keywords: string): string {
  const kw = keywords.toLowerCase();
  if (kw.includes('data') || kw.includes('ml') || kw.includes('machine learning') || kw.includes('analyst')) return 'data-science';
  if (kw.includes('design') || kw.includes('ux') || kw.includes('ui ')) return 'design-multimedia';
  if (kw.includes('marketing') || kw.includes('growth') || kw.includes('seo')) return 'marketing';
  if (kw.includes('finance') || kw.includes('accounting') || kw.includes('cfo')) return 'accounting-finance';
  if (kw.includes('hr') || kw.includes('recrui') || kw.includes('people ops')) return 'hr';
  if (kw.includes('write') || kw.includes('content') || kw.includes('copywrite')) return 'copywriting';
  if (kw.includes('support') || kw.includes('customer success') || kw.includes('customer service')) return 'technical-support';
  if (kw.includes('product') || kw.includes('project') || kw.includes('program manager') || kw.includes('manager')) return 'management';
  if (kw.includes('engineer') || kw.includes('mechanical') || kw.includes('electrical') || kw.includes('civil')) return 'engineering';
  if (kw.includes('business') || kw.includes('operations') || kw.includes('strategy')) return 'business';
  return 'dev';
}

async function fetchRemoteOK(keywords: string, limit: number): Promise<{ jobs: LinkedInScrapedJob[]; error?: string }> {
  const tag = keywordsToRemoteOKTag(keywords);
  try {
    const resp = await fetch(`https://remoteok.com/api?tag=${tag}`, {
      headers: { 'User-Agent': 'CaliberBot/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { jobs: [], error: `HTTP ${resp.status}` };
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return { jobs: [], error: 'non-JSON response' };
    const data = await resp.json() as any[];
    const items = Array.isArray(data) ? data.filter((j: any) => j.id && j.position) : [];
    const kw = keywords.toLowerCase().split(/\s+/);
    const matched = items
      .filter((j: any) => {
        const text = `${j.position} ${j.company} ${j.description || ''}`.toLowerCase();
        return kw.some((w) => text.includes(w));
      })
      .slice(0, limit);
    return {
      jobs: matched.map((j: any): LinkedInScrapedJob => ({
        id: `remoteok-${j.id}`,
        title: j.position,
        company: j.company,
        location: 'Remote',
        sourceUrl: `https://remoteok.com/l/${j.id}`,
        sourceName: 'remoteok',
        postDateText: j.date ? new Date(j.date).toLocaleDateString() : null,
        firstSeenAt: null,
        createdAt: null,
        workplaceType: 'remote',
        salary: null,
        snippet: j.description ? String(j.description).substring(0, 300) : null,
        description: j.description ? String(j.description) : null,
      })),
    };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchJobicy(keywords: string, limit: number): Promise<{ jobs: LinkedInScrapedJob[]; error?: string }> {
  const industry = keywordsToJobicyIndustry(keywords);
  try {
    const resp = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=${Math.min(limit * 2, 50)}&industry=${industry}`, {
      headers: { 'User-Agent': 'CaliberBot/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { jobs: [], error: `HTTP ${resp.status}` };
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return { jobs: [], error: 'non-JSON response' };
    const data = await resp.json() as any;
    const items: any[] = data.jobs || [];
    const kw = keywords.toLowerCase().split(/\s+/);
    const matched = items
      .filter((j: any) => {
        const text = `${j.jobTitle} ${j.companyName} ${j.jobExcerpt || ''}`.toLowerCase();
        return kw.some((w) => text.includes(w));
      })
      .slice(0, limit);

    function decodeHtml(str: string): string {
      return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    }

    return {
      jobs: matched.map((j: any): LinkedInScrapedJob => ({
        id: `jobicy-${j.id}`,
        title: decodeHtml(j.jobTitle || ''),
        company: decodeHtml(j.companyName || ''),
        location: 'Remote',
        sourceUrl: j.url,
        sourceName: 'jobicy',
        postDateText: j.pubDate ? new Date(j.pubDate).toLocaleDateString() : null,
        firstSeenAt: null,
        createdAt: null,
        workplaceType: 'remote',
        salary: j.annualSalaryMin && j.annualSalaryMax
          ? `${j.salaryCurrency || '$'}${j.annualSalaryMin.toLocaleString()} - ${j.annualSalaryMax.toLocaleString()}/yr`
          : null,
        snippet: j.jobExcerpt ? String(j.jobExcerpt).substring(0, 300) : null,
        description: j.jobDescription || j.jobExcerpt || null,
      })),
    };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export const executeAdHocSearch = createServerFn({ method: "POST" })
  .inputValidator((data: AdHocSearchParams) => data)
  .handler(async (ctx: any): Promise<AdHocSearchResult> => {
    const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    if (!data.keywords?.trim()) throw new Error("Keywords are required");

    const env = await getCloudflareEnvAsync();
    const limit = Math.min(Math.max(data.limit ?? 25, 1), 50);
    const location = data.location?.trim() || "United States";

    const sources: AdHocSearchResult["sources"] = {};
    const jobs: LinkedInScrapedJob[] = [];

    // ── API aggregator (Adzuna, Jooble, Remotive) ────────────────────────────
    const aggregatorSources = (['adzuna', 'jooble', 'remotive'] as const).filter(() => true);
    try {
      const aggregator = new JobAggregatorService(env?.KV, env?.ADZUNA_API_KEY, env?.JOOBLE_API_KEY);
      const result = await aggregator.search({
        keywords: data.keywords,
        location,
        limit,
        sources: aggregatorSources,
      });
      Object.assign(sources, result.sources);
      for (const job of result.jobs) {
        jobs.push({
          id: `${job.source}-${job.id}`,
          title: job.title,
          company: job.company,
          location: job.location,
          sourceUrl: job.jobUrl,
          sourceName: job.source,
          postDateText: job.postedDate && !isNaN(new Date(job.postedDate).getTime()) ? new Date(job.postedDate).toLocaleDateString() : null,
          firstSeenAt: null,
          createdAt: null,
          workplaceType: job.remote ? 'remote' : null,
          salary: job.salary
            ? [job.salary.min, job.salary.max].filter((v) => v != null).map((v) => `$${v?.toLocaleString()}`).join(' - ') || null
            : null,
          snippet: job.description ? job.description.substring(0, 300) : null,
          description: job.description || null,
        });
      }
    } catch (e) {
      sources['adzuna'] = { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
      sources['jooble'] = { success: false, count: 0, error: 'aggregator failed' };
      sources['remotive'] = { success: false, count: 0, error: 'aggregator failed' };
    }

    // ── RemoteOK ─────────────────────────────────────────────────────────────
    const [remoteokResult, jobicyResult] = await Promise.all([
      fetchRemoteOK(data.keywords, limit),
      fetchJobicy(data.keywords, limit),
    ]);

    sources['remoteok'] = { success: !remoteokResult.error, count: remoteokResult.jobs.length, error: remoteokResult.error };
    jobs.push(...remoteokResult.jobs);

    sources['jobicy'] = { success: !jobicyResult.error, count: jobicyResult.jobs.length, error: jobicyResult.error };
    jobs.push(...jobicyResult.jobs);

    // ── Internal ATS catalog (Greenhouse, Lever) ──────────────────────────────
    if (env.DB) {
      try {
        const db = getDb(env.DB);
        const atsJobs = await searchAtsJobs(db, ['greenhouse', 'lever'], {
          keywords: data.keywords,
          location,
          workplaceTypes: data.workplaceTypes,
          salaryMin: data.salaryMin ?? null,
        });
        sources['greenhouse'] = { success: true, count: atsJobs.filter((j) => j.sourceName === 'greenhouse').length };
        sources['lever'] = { success: true, count: atsJobs.filter((j) => j.sourceName === 'lever').length };
        jobs.push(...atsJobs);
      } catch (e) {
        sources['greenhouse'] = { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
        sources['lever'] = { success: false, count: 0, error: 'ats search failed' };
      }
    }

    // ── Deduplicate by sourceUrl ──────────────────────────────────────────────
    const seen = new Set<string>();
    const deduped = jobs.filter((j) => {
      const key = j.sourceUrl?.trim().toLowerCase() || j.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { jobs: deduped, sources };
  });

export const saveSearchAsAgent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id?: number;
    name: string;
    keywords: string;
    location?: string;
    workplaceTypes?: LinkedInSearchParams["workplaceTypes"];
    employmentTypes?: string[];
    salaryMin?: number | null;
    runIntervalHours?: number;
    isActive?: boolean;
  }) => data)
  .handler(async (ctx: any) => {
    const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    if (!data.name.trim()) throw new Error("Agent name is required");

    const validIntervals = [1, 2, 4, 8, 12, 24];
    const runIntervalHours = validIntervals.includes(data.runIntervalHours ?? 24)
      ? (data.runIntervalHours ?? 24)
      : 24;

    const id = await saveSearchConfiguration({
      userId: user.id,
      id: data.id,
      name: data.name,
      criteria: {
        keywords: data.keywords,
        location: data.location ?? "",
        workplaceTypes: data.workplaceTypes ?? [],
        salaryMin: data.salaryMin ?? null,
      },
      isActive: data.isActive,
      runIntervalHours,
      sources: ['adzuna', 'jooble', 'remotive', 'remoteok', 'jobicy', 'greenhouse', 'lever'],
      employmentTypes: data.employmentTypes,
    });
    return { success: true, id };
  });

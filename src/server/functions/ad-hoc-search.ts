'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { JobAggregatorService } from "@/lib/services";
import { searchAtsJobs } from "@/lib/ats-search";
import type { LinkedInScrapedJob, LinkedInSearchParams } from "@/lib/linkedin-search";
import { resolveSessionUser } from "@/lib/resolve-user";
import { saveSearchConfiguration } from "@/lib/normalized-jobs-persistence";

export const AD_HOC_SOURCES = ['adzuna', 'jooble', 'remotive', 'greenhouse', 'lever'] as const;
export type AdHocSource = (typeof AD_HOC_SOURCES)[number];

export interface AdHocSearchParams {
  keywords: string;
  location?: string;
  remote?: boolean;
  salaryMin?: number | null;
  workplaceTypes?: LinkedInSearchParams["workplaceTypes"];
  limit?: number;
  sources: AdHocSource[];
}

export interface AdHocSearchResult {
  jobs: LinkedInScrapedJob[];
  sources: Record<string, { success: boolean; count: number; error?: string }>;
}

export const executeAdHocSearch = createServerFn({ method: "POST" })
  .inputValidator((data: AdHocSearchParams) => data)
  .handler(async ({ data }, ctx): Promise<AdHocSearchResult> => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    if (!data.keywords?.trim()) throw new Error("Keywords are required");

    const env = await getCloudflareEnvAsync();
    const limit = Math.min(Math.max(data.limit ?? 25, 1), 100);
    const location = data.location?.trim() || "United States";

    const apiSources = data.sources.filter((s): s is 'adzuna' | 'jooble' | 'remotive' =>
      s === 'adzuna' || s === 'jooble' || s === 'remotive');
    const atsSources = data.sources.filter((s) => s === 'greenhouse' || s === 'lever');

    const sources: AdHocSearchResult["sources"] = {};
    const jobs: LinkedInScrapedJob[] = [];

    if (apiSources.length > 0) {
      const aggregator = new JobAggregatorService(env?.KV, env?.ADZUNA_API_KEY, env?.JOOBLE_API_KEY);
      const result = await aggregator.search({
        keywords: data.keywords,
        location,
        limit,
        sources: apiSources,
      });
      console.log(`[executeAdHocSearch] Aggregator returned ${result.jobs.length} jobs (${result.deduped} deduplicated)`, {
        sources: result.sources,
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
          postDateText: job.postedDate ? new Date(job.postedDate).toLocaleDateString() : null,
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
    }

    if (atsSources.length > 0 && env.DB) {
      const db = getDb(env.DB);
      const atsJobs = await searchAtsJobs(db, atsSources, {
        keywords: data.keywords,
        location,
        workplaceTypes: data.workplaceTypes,
        salaryMin: data.salaryMin ?? null,
      });
      for (const source of atsSources) {
        sources[source] = { success: true, count: atsJobs.filter((j) => j.sourceName === source).length };
      }
      jobs.push(...atsJobs);
    }

    return { jobs, sources };
  });

export const saveSearchAsAgent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id?: number;
    name: string;
    keywords: string;
    location?: string;
    workplaceTypes?: LinkedInSearchParams["workplaceTypes"];
    salaryMin?: number | null;
    sources: AdHocSource[];
    runIntervalHours?: number;
    isActive?: boolean;
  }) => data)
  .handler(async ({ data }, ctx) => {
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) throw new Error("Not authenticated");
    if (!data.name.trim()) throw new Error("Agent name is required");

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
      runIntervalHours: data.runIntervalHours,
      sources: data.sources,
    });
    return { success: true, id };
  });

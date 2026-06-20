// Cron worker: polls active search agents (searchConfigurations) and runs
// their saved searches against the API-based job sources, persisting new
// results into normalizedJobs owned by the agent's user.

import { getDb } from '@/db/db';
import { searchConfigurations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { CloudflareEnv } from '@/lib/cloudflare';
import { JobAggregatorService } from '@/lib/services';
import { searchAtsJobs } from '@/lib/ats-search';
import { canonicalizeJobUrl, upsertNormalizedJobs, type NormalizedJobInput } from '@/lib/normalized-jobs-persistence';
import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';

const DEFAULT_LIMIT = 25;

function isDue(config: { lastRunAt: string | null; runIntervalHours: number }): boolean {
  if (!config.lastRunAt) return true;
  const last = new Date(config.lastRunAt).getTime();
  const intervalMs = config.runIntervalHours * 60 * 60 * 1000;
  return Date.now() - last >= intervalMs;
}

function toNormalizedJobInput(job: LinkedInScrapedJob, userId: string, savedSearchId: number): NormalizedJobInput {
  const now = new Date().toISOString();
  return {
    userId,
    savedSearchId,
    sourceOrigin: job.sourceName ?? 'unknown',
    externalReferenceId: null,
    jobTitle: job.title,
    employerName: job.company,
    location: job.location ?? null,
    industry: null,
    sourceUrl: job.sourceUrl,
    canonicalSourceUrl: canonicalizeJobUrl(job.sourceUrl),
    rawPayload: null,
    description: job.description ?? null,
    descriptionPruned: null,
    snippet: job.snippet ?? (job.description ? job.description.substring(0, 300) : null),
    salary: job.salary ?? null,
    postDateText: job.postDateText ?? null,
    workplaceType: job.workplaceType ?? null,
    remoteType: job.workplaceType === 'remote' ? 'fully_remote' : 'unspecified',
    currentStage: 'Discovered',
    discoveryTimestamp: now,
    lastSeenAt: now,
  };
}

export async function runAgentPoller(env: CloudflareEnv): Promise<void> {
  if (!env.DB) return;
  const db = getDb(env.DB);

  const configs = await db
    .select()
    .from(searchConfigurations)
    .where(eq(searchConfigurations.isActive, 1));

  for (const config of configs) {
    if (!isDue({ lastRunAt: config.lastRunAt, runIntervalHours: config.runIntervalHours })) continue;

    let criteria: {
      keywords?: string;
      location?: string;
      workplaceTypes?: LinkedInSearchParams["workplaceTypes"];
      salaryMin?: number | null;
    };
    try {
      criteria = JSON.parse(config.criteria);
    } catch {
      continue;
    }
    const keywords = criteria.keywords?.trim();
    if (!keywords) continue;
    const location = criteria.location?.trim() || 'United States';

    let sources: string[];
    try {
      sources = config.sources ? (JSON.parse(config.sources) as string[]) : ['adzuna', 'greenhouse', 'lever'];
    } catch {
      sources = ['adzuna', 'greenhouse', 'lever'];
    }

    const apiSources = sources.filter((s): s is 'adzuna' | 'jooble' | 'remotive' =>
      s === 'adzuna' || s === 'jooble' || s === 'remotive');
    const atsSources = sources.filter((s) => s === 'greenhouse' || s === 'lever');

    const jobs: LinkedInScrapedJob[] = [];

    if (apiSources.length > 0) {
      const aggregator = new JobAggregatorService(env.KV, env.ADZUNA_API_KEY, env.JOOBLE_API_KEY);
      const result = await aggregator.search({ keywords, location, limit: DEFAULT_LIMIT, sources: apiSources });
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
    }

    if (atsSources.length > 0) {
      const atsJobs = await searchAtsJobs(db, atsSources, {
        keywords,
        location,
        workplaceTypes: criteria.workplaceTypes,
        salaryMin: criteria.salaryMin ?? null,
      });
      jobs.push(...atsJobs);
    }

    if (jobs.length > 0) {
      await upsertNormalizedJobs(jobs.map((job) => toNormalizedJobInput(job, config.userId, config.id)));
    }

    await db
      .update(searchConfigurations)
      .set({ lastRunAt: new Date().toISOString() })
      .where(eq(searchConfigurations.id, config.id));
  }
}

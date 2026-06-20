// Cron worker: polls active search agents (searchConfigurations) and runs
// their saved searches against the API-based job sources, persisting new
// results into normalizedJobs owned by the agent's user.

import { getDb } from '@/db/db';
import { searchConfigurations, masterResume, normalizedJobs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { CloudflareEnv } from '@/lib/cloudflare';
import { JobAggregatorService } from '@/lib/services';
import { searchAtsJobs } from '@/lib/ats-search';
import { canonicalizeJobUrl } from '@/lib/normalized-jobs-persistence';
import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';
import type { AtsJobResponse } from '@/types/crawler';
import { normalizeJob } from '@/lib/normalization';
import { dedupPipeline } from '@/server/dedup/deterministic';
import { insertCanonicalJob, linkJobSource } from '@/server/db/queries';
import { scoreJobAgainstProfile } from '@/lib/ai/job-score';

const DEFAULT_LIMIT = 25;

function isDue(config: { lastRunAt: string | null; runIntervalHours: number }): boolean {
  if (!config.lastRunAt) return true;
  const last = new Date(config.lastRunAt).getTime();
  const intervalMs = config.runIntervalHours * 60 * 60 * 1000;
  return Date.now() - last >= intervalMs;
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
    const atsSources = sources.filter((s) => s === 'greenhouse' || s === 'lever' || s === 'workable' || s === 'ashby');

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
      // 1. Fetch user resume
      const resumeRows = await db
        .select({ rawText: masterResume.rawText })
        .from(masterResume)
        .where(eq(masterResume.userId, config.userId))
        .limit(1);
      const resumeText = resumeRows[0]?.rawText || '';

      const now = new Date().toISOString();

      for (const job of jobs) {
        let canonicalId = job.id;
        
        // If it's a scraped job from API and not from local ATS search, we need to dedup and insert into canonical
        const isFromApi = !job.id.startsWith('ats-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.id);
        if (isFromApi) {
          const rawJobResponse: AtsJobResponse = {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location ?? undefined,
            description: job.description ?? job.snippet ?? undefined,
            absoluteUrl: job.sourceUrl,
            applyUrl: job.sourceUrl,
            publishedAt: job.postDateText ?? undefined,
            raw: job as any,
          };
          const normalized = normalizeJob(rawJobResponse);
          const decision = await dedupPipeline(env as any, normalized);
          
          if (decision.canonicalId) {
            canonicalId = decision.canonicalId;
          } else {
            canonicalId = crypto.randomUUID();
            await insertCanonicalJob(env as any, canonicalId, normalized);
            
            // Generate and upsert embedding to Vectorize index
            try {
              const { embedJob, upsertVector } = await import('../dedup/embedding');
              const vector = await embedJob(env as any, normalized);
              await upsertVector(env as any, canonicalId, normalized.companyNorm, vector);
            } catch (embedErr) {
              console.error(`[agent-poller] Failed to generate/upsert embedding for ${canonicalId}:`, embedErr);
            }
          }

          // Link job source
          await linkJobSource(env as any, canonicalId, {
            ats: job.sourceName || 'search_agent',
            boardToken: 'search_agent',
            sourceJobId: job.id,
            sourceUrl: job.sourceUrl,
            applyUrl: job.sourceUrl,
            rawHash: normalized.rawHash,
          });
        }

        // 2. Perform AI scoring
        let scores = {
          atsScore: 50,
          careerScore: 50,
          outlookScore: 50,
          masterScore: 50,
          atsReason: 'AI scoring model unavailable.',
          careerReason: 'AI scoring model unavailable.',
          outlookReason: 'AI scoring model unavailable.',
          isUnicorn: false,
          unicornReason: null as string | null,
        };
        if (resumeText) {
          try {
            scores = await scoreJobAgainstProfile(env.AI, resumeText, {
              id: canonicalId,
              title: job.title,
              description: job.description || job.snippet || '',
            });
          } catch (scoreErr) {
            console.error(`[agent-poller] Scoring failed for job ${canonicalId}:`, scoreErr);
          }
        }

        // 3. Upsert normalized_jobs with favorited flag and canonical ID reference
        const rawSourceUrl = job.sourceUrl || `https://caliber.internal/jobs/canonical/${canonicalId}`;
        const canonicalUrl = canonicalizeJobUrl(rawSourceUrl);
        const [existing] = await db
          .select()
          .from(normalizedJobs)
          .where(
            and(
              eq(normalizedJobs.userId, config.userId),
              eq(normalizedJobs.canonicalSourceUrl, canonicalUrl)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(normalizedJobs)
            .set({
              canonicalJobId: canonicalId,
              isFavorited: true, // auto-favorite
              atsScore: scores.atsScore,
              careerScore: scores.careerScore,
              outlookScore: scores.outlookScore,
              masterScore: scores.masterScore,
              atsReason: scores.atsReason,
              careerReason: scores.careerReason,
              outlookReason: scores.outlookReason,
              isUnicorn: scores.isUnicorn ? 1 : 0,
              unicornReason: scores.unicornReason,
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(eq(normalizedJobs.id, existing.id));
        } else {
          await db.insert(normalizedJobs).values({
            userId: config.userId,
            savedSearchId: config.id,
            canonicalJobId: canonicalId,
            isFavorited: true, // auto-favorite
            sourceOrigin: job.sourceName || 'unknown',
            jobTitle: job.title,
            employerName: job.company,
            location: job.location || null,
            sourceUrl: rawSourceUrl,
            canonicalSourceUrl: canonicalUrl,
            description: job.description || null,
            snippet: job.snippet || null,
            salary: job.salary || null,
            postDateText: job.postDateText || null,
            workplaceType: job.workplaceType || null,
            remoteType: job.workplaceType === 'remote' ? 'fully_remote' : 'unspecified',
            currentStage: 'Discovered',
            isFlagged: false,
            isUnicorn: scores.isUnicorn ? 1 : 0,
            unicornReason: scores.unicornReason,
            atsScore: scores.atsScore,
            careerScore: scores.careerScore,
            outlookScore: scores.outlookScore,
            masterScore: scores.masterScore,
            atsReason: scores.atsReason,
            careerReason: scores.careerReason,
            outlookReason: scores.outlookReason,
            discoveryTimestamp: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await db
      .update(searchConfigurations)
      .set({ lastRunAt: new Date().toISOString() })
      .where(eq(searchConfigurations.id, config.id));
  }
}

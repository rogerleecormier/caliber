import { getDb, schema } from "@/db/db";
import { linkedinSavedSearches, pipelineJobs, masterResume } from "@/db/schema";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getLinkedinSettings, pruneDuplicateLinkedinJobResults } from "@/lib/linkedin-persistence";
import { buildLinkedInSearchUrl, buildLinkedInSearchUrlForPage, normalizeLinkedInSearchParams, type LinkedInScrapedJob, type LinkedInSearchParams } from "@/lib/linkedin-search";
import { scoreJobAgainstProfile } from "@/lib/ai/job-score";
import {
  buildLinkedinJobSemanticKey,
  canonicalizeLinkedinJobUrl,
  findExistingLinkedinJobs,
  findSemanticallyMatchingExistingLinkedinJobs,
  upsertLinkedinJobResults,
} from "@/lib/linkedin-persistence";
import { and, eq, lte } from "drizzle-orm";
import { searchAtsJobs } from "@/lib/ats-search";
import { logSearchEvent, logSearchEvents } from "@/lib/pipeline-persistence";
import { withRetry } from "@/lib/sync-queue";

type BrowserPage = any;

function shouldRunAtScheduledTime(
  cronFrequency: string,
  startHour: number,
  varianceMinutes: number,
): boolean {
  const frequencyMap: Record<string, number> = {
    "hourly": 1,
    "every_2_hours": 2,
    "every_4_hours": 4,
    "every_8_hours": 8,
    "every_12_hours": 12,
    "daily": 24,
  };

  const cronFrequencyHours = frequencyMap[cronFrequency] || 24;
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinutes = now.getUTCMinutes();
  const variance = Math.floor(Math.random() * varianceMinutes);

  // Calculate all scheduled run hours based on frequency
  const scheduledHours: number[] = [];
  for (let h = 0; h < 24; h += cronFrequencyHours) {
    scheduledHours.push((startHour + h) % 24);
  }

  // Check if current hour matches any scheduled hour
  if (!scheduledHours.includes(currentHour)) return false;

  // Allow execution for the first variance minutes of the scheduled hour
  return currentMinutes < variance;
}

async function extractSearchCards(page: BrowserPage, limit: number): Promise<LinkedInScrapedJob[]> {
  return page.evaluate((maxResults: number) => {
    const rows = Array.from(
      document.querySelectorAll("li, .base-card, .jobs-search__results-list li, .jobs-search-results__list-item"),
    );
    const results: LinkedInScrapedJob[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const anchor =
        row.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]') ||
        row.querySelector<HTMLAnchorElement>('a.base-card__full-link');
      if (!anchor?.href) continue;

      const url = new URL(anchor.href, window.location.origin);
      const id = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || url.searchParams.get("currentJobId") || anchor.href;
      if (seen.has(id)) continue;
      seen.add(id);

      const title = (
        row.querySelector(".base-search-card__title")?.textContent ||
        row.querySelector(".job-search-card__title")?.textContent ||
        anchor.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();
      if (!title) continue;

      results.push({
        id,
        title,
        company: (
          row.querySelector(".base-search-card__subtitle")?.textContent ||
          row.querySelector(".job-search-card__subtitle")?.textContent ||
          row.querySelector("h4")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim() || "Unknown company",
        location: (
          row.querySelector(".job-search-card__location")?.textContent ||
          row.querySelector(".base-search-card__metadata")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim() || "Location not listed",
        sourceUrl: anchor.href,
        sourceName: "LinkedIn",
        postDateText: (
          row.querySelector("time")?.getAttribute("datetime") ||
          row.querySelector("time")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim() || null,
        workplaceType: null,
        salary: (
          row.querySelector(".job-search-card__salary-info")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim() || null,
        snippet: (
          row.querySelector(".job-search-card__snippet")?.textContent ||
          row.querySelector(".base-search-card__snippet")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim() || null,
        description: null,
      });

      if (results.length >= maxResults) break;
    }

    return results;
  }, limit);
}

async function expandSearchResults(page: BrowserPage, targetCount: number) {
  await page.evaluate(async (desiredCount: number) => {
    for (let i = 0; i < 8; i++) {
      const currentCount = document.querySelectorAll('a[href*="/jobs/view/"], a.base-card__full-link').length;
      if (currentCount >= desiredCount) break;
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }, targetCount);
}

function dedupeJobsByCanonicalUrl(jobs: LinkedInScrapedJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = canonicalizeLinkedinJobUrl(job.sourceUrl, job.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeJobsBySemanticKey(jobs: LinkedInScrapedJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = buildLinkedinJobSemanticKey({
      title: job.title,
      company: job.company,
      location: job.location,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractJobDescription(page: BrowserPage): Promise<string | null> {
  return page.evaluate(() => {
    const copy = document.body.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("script, style, nav, footer, header, form").forEach((el) => el.remove());
    const preferred =
      copy.querySelector(".show-more-less-html__markup") ||
      copy.querySelector(".description__text") ||
      copy.querySelector(".jobs-description") ||
      copy.querySelector("main");
    const text = ((preferred?.textContent || copy.innerText || copy.textContent || "")).replace(/\s+/g, " ").trim();
    return text.length > 120 ? text : null;
  });
}

async function buildProfile(db: ReturnType<typeof getDb>, userId: string) {
  const [resume] = await db.select().from(masterResume).where(eq(masterResume.userId, userId)).limit(1);
  if (!resume?.rawText) return null;
  let profile = `Resume:\n${resume.rawText}`;
  try {
    if (resume.competencies) {
      const competencies = JSON.parse(resume.competencies) as string[];
      if (competencies.length > 0) profile += `\n\nCore Competencies: ${competencies.join(", ")}`;
    }
  } catch {}
  try {
    if (resume.tools) {
      const tools = JSON.parse(resume.tools) as string[];
      if (tools.length > 0) profile += `\n\nTools: ${tools.join(", ")}`;
    }
  } catch {}
  return profile;
}

async function collectLinkedinJobsAcrossPages(args: {
  browser: Awaited<ReturnType<typeof import("@cloudflare/puppeteer")["default"]["launch"]>>;
  criteria: LinkedInSearchParams;
}) {
  const allJobs: LinkedInScrapedJob[] = [];
  const requestedPages = args.criteria.pagesToScan || 1;
  const perPageLimit = args.criteria.limit || 10;

  for (let pageOffset = 0; pageOffset < requestedPages; pageOffset += 1) {
    const pageNumber = (args.criteria.page || 1) + pageOffset;
    const searchUrl = buildLinkedInSearchUrlForPage(args.criteria, pageNumber);
    const page = await args.browser.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await expandSearchResults(page, perPageLimit);
      const pageJobs = await extractSearchCards(page, perPageLimit);
      allJobs.push(
        ...pageJobs.map((job) => ({
          ...job,
          sourceUrl: canonicalizeLinkedinJobUrl(job.sourceUrl, job.id),
        })),
      );
    } finally {
      await page.close();
    }
  }

  return dedupeJobsByCanonicalUrl(allJobs);
}

export async function runLinkedinSearchMaintenance(env: CloudflareEnv) {
  const settings = await getLinkedinSettings();
  const db = getDb(env.DB);

  // 1. Database Pruning: Perform daily database cleanup of jobs 30 days or older
  const currentHour = new Date().getUTCHours();
  let prunedCount = 0;
  if (currentHour === 0) {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();
    
    // Prune general jobs cache table
    const jobsDeletedResult = await db.delete(schema.jobs).where(lte(schema.jobs.createdAt, cutoffDate));
    
    // Prune agent job results (pipelineJobs) - only prune Discovered status
    await db.delete(pipelineJobs).where(
      and(
        lte(pipelineJobs.createdAt, cutoffIso),
        eq(pipelineJobs.status, 'Discovered')
      )
    );
    
    prunedCount = (jobsDeletedResult as any)?.rowsAffected || 0;
    console.log(`[Pruning] Deleted old cache and agent jobs.`);
  }

  const duplicatePrunedCount = await pruneDuplicateLinkedinJobResults();

  // 2. Load active searches
  const searches = await db.select().from(linkedinSavedSearches).where(eq(linkedinSavedSearches.isActive, 1));

  // Filter searches based on admin cron schedule (time-of-day based, not interval-based)
  const dueSearches = searches.filter(() =>
    shouldRunAtScheduledTime(
      settings.linkedinSearchCronFrequency,
      settings.linkedinCronStartHour,
      settings.linkedinCronVarianceMinutes
    )
  );

  if (dueSearches.length === 0) {
    return { duplicatePrunedCount, prunedCount, executedSearches: 0 };
  }

  const ai = env.AI;

  try {
    for (const search of dueSearches) {
      const lockKey = `user:${search.userId}:agent:${search.id}:running`;
      if (env.KV) {
        await env.KV.put(lockKey, "true", { expirationTtl: 300 });
      }

      let sourcesList: string[] = ['linkedin'];
      try {
        if ((search as any).sources) {
          sourcesList = JSON.parse((search as any).sources) as string[];
        }
      } catch {
        sourcesList = ['linkedin'];
      }

      const criteria = normalizeLinkedInSearchParams(JSON.parse(search.criteria) as LinkedInSearchParams);

      await logSearchEvent({
        userId: search.userId,
        savedSearchId: search.id,
        eventType: "cron_triggered",
        platform: sourcesList.join(", "),
        agentName: search.name,
        message: `Cron agent "${search.name}" triggered background search.`,
        level: "info",
        metadata: {
          agentName: search.name,
          keywords: criteria.keywords,
          location: criteria.location || "Any Location",
          postedWithin: criteria.postedWithin || "any",
          sortBy: criteria.sortBy || "recent",
          easyApply: criteria.easyApply ? "Yes" : "No",
          selectedSources: sourcesList.join(", "),
          geoId: criteria.geoId || undefined,
          distance: criteria.distance != null ? criteria.distance : undefined,
          f_SAL: criteria.f_SAL || undefined,
          useSemanticFormat: criteria.useSemanticFormat ? "Yes" : "No",
        }
      });

      try {
        const searchUrl = buildLinkedInSearchUrl(criteria);

        // Scrape LinkedIn if enabled
        let linkedinJobs: LinkedInScrapedJob[] = [];
        if (sourcesList.includes('linkedin')) {
          const puppeteer = await import("@cloudflare/puppeteer");
          linkedinJobs = await withRetry(
            async () => {
              const currentBrowser = await puppeteer.default.launch(env.BROWSER);
              try {
                return await collectLinkedinJobsAcrossPages({ browser: currentBrowser, criteria });
              } finally {
                try {
                  await currentBrowser.close();
                } catch (err) {
                  console.error("[cron-search] failed to close browser during search list scraping:", err);
                }
              }
            },
            {
              maxRetries: 2,
              baseDelayMs: 2000,
              onRetry: (attempt, error) => {
                console.warn(`[cron-search] Search list scraping failed, retrying (attempt ${attempt}):`, error);
              },
            }
          );
        }

        // Query local Greenhouse/Lever/Workable cache if enabled
        const hasAtsSources = sourcesList.some(s => s !== 'linkedin');
        if (hasAtsSources) {
          await logSearchEvent({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "ats_search_started",
            platform: sourcesList.filter(s => s !== "linkedin").join(", "),
            agentName: search.name,
            message: `Cron agent "${search.name}" checking local ATS cache...`,
            level: "info",
          });
        }

        const atsJobs = await searchAtsJobs(db, sourcesList, criteria);

        if (hasAtsSources) {
          await logSearchEvent({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "ats_search_completed",
            platform: sourcesList.filter(s => s !== "linkedin").join(", "),
            agentName: search.name,
            message: `Cron agent "${search.name}" completed ATS check: found ${atsJobs.length} jobs in cache`,
            level: "info",
            metadata: {
              agentName: search.name,
              keywords: criteria.keywords,
              location: criteria.location || "Any Location",
              count: atsJobs.length,
              atsSources: sourcesList.filter(s => s !== "linkedin").join(", "),
            },
          });
        }

        // Combine candidates from LinkedIn and ATS cache
        let jobs = [...linkedinJobs, ...atsJobs];

        const existingJobsByUrl = await findExistingLinkedinJobs({
          userId: search.userId,
          jobs: jobs.map((job) => ({ id: job.id, sourceUrl: job.sourceUrl })),
        });
        const semanticExistingJobs = await findSemanticallyMatchingExistingLinkedinJobs({
          userId: search.userId,
          jobs,
        });

        const initialCount = jobs.length;
        const skippedJobs: typeof jobs = [];
        const uniqueNewJobs = dedupeJobsBySemanticKey(
          jobs.filter((job) => {
            const exactMatch = existingJobsByUrl.get(canonicalizeLinkedinJobUrl(job.sourceUrl, job.id));
            const semanticKey = buildLinkedinJobSemanticKey({
              title: job.title,
              company: job.company,
              location: job.location,
            });
            const semanticMatch = semanticExistingJobs.get(semanticKey);
            const isDup = exactMatch || semanticMatch;
            if (isDup) {
              skippedJobs.push(job);
            }
            return !isDup;
          }),
        );
        jobs = uniqueNewJobs;
        const reusedCount = initialCount - jobs.length;

        if (skippedJobs.length > 0) {
          const duplicateLogs = skippedJobs.map((job) => ({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "job_skipped_duplicate",
            platform: job.sourceName,
            agentName: search.name,
            message: `Skipped duplicate: "${job.title}" at ${job.company} already exists`,
            level: "info" as const,
            metadata: {
              jobId: job.id,
              jobTitle: job.title,
              company: job.company,
              location: job.location,
              sourceUrl: job.sourceUrl,
            },
          }));
          await logSearchEvents(duplicateLogs);
        }

        if (jobs.length === 0) {
          await upsertLinkedinJobResults({
            userId: search.userId,
            savedSearchId: search.id,
            searchUrl,
            criteria,
            jobs: [],
          });

          await logSearchEvent({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "search_completed",
            platform: sourcesList.join(", "),
            agentName: search.name,
            message: `Cron agent "${search.name}" completed: 0 new jobs found (${reusedCount} reused/skipped)`,
            level: "info",
            metadata: {
              agentName: search.name,
              keywords: criteria.keywords,
              location: criteria.location || "Any Location",
              platformSources: sourcesList.join(", "),
              totalJobsFound: initialCount,
              newJobsScored: 0,
              reusedJobsCount: reusedCount,
              searchUrl,
              geoId: criteria.geoId || undefined,
              distance: criteria.distance != null ? criteria.distance : undefined,
              f_SAL: criteria.f_SAL || undefined,
              useSemanticFormat: criteria.useSemanticFormat ? "Yes" : "No",
            },
          });
          continue;
        }

        // Enrich job descriptions for LinkedIn jobs only (ATS jobs already have descriptions)
        const needEnrichment = jobs.some(job => !job.id.startsWith('ats-'));
        if (needEnrichment) {
          const puppeteer = await import("@cloudflare/puppeteer");
          await withRetry(
            async () => {
              const currentBrowser = await puppeteer.default.launch(env.BROWSER);
              try {
                for (const job of jobs) {
                  if (job.id.startsWith('ats-')) continue;
                  const detailPage = await currentBrowser.newPage();
                  try {
                    await detailPage.goto(canonicalizeLinkedinJobUrl(job.sourceUrl, job.id), { waitUntil: "domcontentloaded", timeout: 60000 });
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    job.description = await extractJobDescription(detailPage);
                  } catch {
                    job.description = job.snippet;
                  } finally {
                    try {
                      await detailPage.close();
                    } catch (err) {
                      console.error("[cron-search] failed to close detail page:", err);
                    }
                  }
                }
              } finally {
                try {
                  await currentBrowser.close();
                } catch (err) {
                  console.error("[cron-search] failed to close browser during enrichment:", err);
                }
              }
            },
            {
              maxRetries: 2,
              baseDelayMs: 2000,
              onRetry: (attempt, error) => {
                console.warn(`[cron-search] Job enrichment failed, retrying (attempt ${attempt}):`, error);
              },
            }
          );
        }

        const profile = await buildProfile(db, search.userId);
        if (!profile) {
          await logSearchEvent({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "error",
            platform: sourcesList.join(", "),
            agentName: search.name,
            message: `Cron agent "${search.name}" skipped: Master resume not found for scoring.`,
            level: "warning",
          });
          continue;
        }

        const scoredJobs = await Promise.all(
          jobs.map(async (job) => {
            const score = await scoreJobAgainstProfile(ai, profile, {
              id: job.id,
              title: job.title,
              description: job.description || job.snippet || `${job.title} ${job.company} ${job.location}`,
            });
            return {
              ...job,
              score,
            };
          }),
        );

        await upsertLinkedinJobResults({
          userId: search.userId,
          savedSearchId: search.id,
          searchUrl,
          criteria,
          jobs: scoredJobs,
        });

        if (scoredJobs.length > 0) {
          const foundLogs = scoredJobs.map((job) => ({
            userId: search.userId,
            savedSearchId: search.id,
            eventType: "job_found",
            platform: job.sourceName,
            agentName: search.name,
            message: `New job surfaced: "${job.title}" at ${job.company} (${job.location})`,
            level: "success" as const,
            metadata: {
              jobId: job.id,
              jobTitle: job.title,
              company: job.company,
              location: job.location,
              matchScore: job.score?.masterScore ?? null,
              pursue: job.score ? job.score.masterScore >= 80 : null,
              salary: job.salary,
              sourceUrl: job.sourceUrl,
            },
          }));
          await logSearchEvents(foundLogs);
        }

        await logSearchEvent({
          userId: search.userId,
          savedSearchId: search.id,
          eventType: "search_completed",
          platform: sourcesList.join(", "),
          agentName: search.name,
          message: `Cron agent "${search.name}" completed: found ${initialCount} jobs (${scoredJobs.length} new scored, ${reusedCount} reused/skipped)`,
          level: "success",
          metadata: {
            agentName: search.name,
            keywords: criteria.keywords,
            location: criteria.location || "Any Location",
            platformSources: sourcesList.join(", "),
            totalJobsFound: initialCount,
            newJobsScored: scoredJobs.length,
            reusedJobsCount: reusedCount,
            searchUrl,
            geoId: criteria.geoId || undefined,
            distance: criteria.distance != null ? criteria.distance : undefined,
            f_SAL: criteria.f_SAL || undefined,
            useSemanticFormat: criteria.useSemanticFormat ? "Yes" : "No",
          },
        });
      } catch (err) {
        console.error(`Cron agent ${search.name} error:`, err);
        await logSearchEvent({
          userId: search.userId,
          savedSearchId: search.id,
          eventType: "error",
          platform: sourcesList.join(", "),
          agentName: search.name,
          message: `Cron agent "${search.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
        });
      } finally {
        if (env.KV) {
          await env.KV.delete(lockKey);
        }
      }
    }
  } finally {
    // Outer browser cleanup not needed anymore as sessions are managed per-search
  }

  return { duplicatePrunedCount, prunedCount, executedSearches: dueSearches.length };
}

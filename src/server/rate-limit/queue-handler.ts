import { fetchGreenhouseJobs } from '../ats/parsers/greenhouse';
import { fetchLeverJobs } from '../ats/parsers/lever';
import { fetchAshbyJobs } from '../ats/parsers/ashby';
import { fetchWorkableJobs } from '../ats/parsers/workable';
import { fetchRemoteOKJobs } from '../ats/parsers/remoteok';
import { fetchHimalayasJobs } from '../ats/parsers/himalayas';
import { fetchJobicyJobs } from '../ats/parsers/jobicy';
import { fetchAdzunaJobs } from '../ats/parsers/adzuna';
import { fetchJoobleJobs } from '../ats/parsers/jooble';
import { fetchRemotiveJobs } from '../ats/parsers/remotive';
import {
  logAudit,
  prepareInsertCanonicalJob,
  prepareLinkJobSource,
} from '../db/queries';
import { normalizeJob } from '@/lib/normalization';
import { dedupPipeline } from '../dedup/deterministic';
import { enqueueJobScore } from '@/lib/job-score-queue';

export interface CrawlMessage {
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'remoteok' | 'himalayas' | 'jobicy' | 'adzuna' | 'jooble' | 'remotive';
  token: string;
  boardId: string;
  companyName?: string;
  crawlUuid?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processCrawlJobsQueue(
  batch: { messages: Array<{ body: CrawlMessage; retry: () => void }> },
  env: any
): Promise<void> {
  for (const message of batch.messages) {
    const { ats, token, boardId, companyName, crawlUuid } = message.body;
    const uuid = crawlUuid || crypto.randomUUID();

    try {
      console.log(`[queue-handler] Starting crawl for ${ats}/${token} (boardId: ${boardId}, uuid: ${uuid})`);
      await logAudit(env, {
        eventType: 'crawl_start',
        ats,
        boardToken: token,
        details: { boardId, crawlUuid: uuid },
      });

      // 1. Acquire rate limit token from DO
      let domain = 'api.greenhouse.io';
      if (ats === 'lever')    domain = 'api.lever.co';
      if (ats === 'ashby')    domain = 'api.ashbyhq.com';
      if (ats === 'workable') domain = 'apply.workable.com';
      if (ats === 'remoteok') domain = 'remoteok.com';
      if (ats === 'himalayas') domain = 'himalayas.app';
      if (ats === 'jobicy')   domain = 'jobicy.com';
      if (ats === 'adzuna')   domain = 'api.adzuna.com';
      if (ats === 'jooble')   domain = 'jooble.org';
      if (ats === 'remotive') domain = 'remotive.com';

      const doId = env.RATE_LIMITER.idFromName(domain);
      const doStub = env.RATE_LIMITER.get(doId);

      let allowed = false;
      let attempts = 0;
      while (!allowed && attempts < 5) {
        attempts++;
        const res = await doStub.fetch(`http://limit/acquire?tokens=1`);
        if (res.status === 200) {
          allowed = true;
        } else if (res.status === 429) {
          const body: { retryAfterMs?: number } = await res.json();
          const delay = body.retryAfterMs || 1000;
          console.log(`[queue-handler] Rate limited for ${domain}. Waiting ${delay}ms (attempt ${attempts}/5)...`);
          await sleep(delay);
        } else {
          console.error(`[queue-handler] Rate limit DO returned unexpected status: ${res.status}`);
          break;
        }
      }

      if (!allowed) {
        throw new Error(`Rate limit acquisition failed after 5 attempts for ${domain}`);
      }

      // 2. Fetch jobs from ATS or aggregator
      let rawJobs: any[] = [];
      if (ats === 'greenhouse') {
        rawJobs = await fetchGreenhouseJobs(token, companyName);
      } else if (ats === 'lever') {
        rawJobs = await fetchLeverJobs(token, companyName);
      } else if (ats === 'ashby') {
        rawJobs = await fetchAshbyJobs(token, companyName);
      } else if (ats === 'workable') {
        rawJobs = await fetchWorkableJobs(token, companyName);
      } else if (ats === 'remoteok') {
        rawJobs = await fetchRemoteOKJobs(token);
      } else if (ats === 'himalayas') {
        rawJobs = await fetchHimalayasJobs(token);
      } else if (ats === 'jobicy') {
        rawJobs = await fetchJobicyJobs(token);
      } else if (ats === 'adzuna') {
        rawJobs = await fetchAdzunaJobs(token, companyName, env);
      } else if (ats === 'jooble') {
        rawJobs = await fetchJoobleJobs(token, companyName, env);
      } else if (ats === 'remotive') {
        rawJobs = await fetchRemotiveJobs(token);
      }

      console.log(`[queue-handler] Fetched ${rawJobs.length} jobs for ${ats}/${token}`);

      // 3. Process jobs and dedup (Stage 1 only for Phase 2)
      let insertedCount = 0;
      let mergedCount = 0;

      // Pre-normalise all jobs first so we can build an efficient dedup lookup.
      // Aggregator boards (remoteok, himalayas, etc.) return jobs from many different
      // companies, so loading candidates by a single company_norm misses most of them.
      // Instead: collect all dedup_keys for this batch and check them in one query,
      // then fall back to a per-company fuzzy candidate load for Stage 2.
      const allNormalized = rawJobs.map(j => normalizeJob(j));

      const candidates: Array<{ id: string; company_norm: string; title_norm: string; location_norm: string | null; dedup_key: string }> = [];

      if (allNormalized.length > 0) {
        // D1 caps SQL variables at 100 — chunk the dedup_key lookup to stay under that limit.
        const dedupKeys = allNormalized.map(n => n.dedupKey);
        const CHUNK = 99;
        for (let i = 0; i < dedupKeys.length; i += CHUNK) {
          const chunk = dedupKeys.slice(i, i + CHUNK);
          const placeholders = chunk.map(() => '?').join(',');
          const { results: keyMatches } = await env.DB.prepare(
            `SELECT id, company_norm, title_norm, location_norm, dedup_key FROM canonical_jobs WHERE dedup_key IN (${placeholders})`
          ).bind(...chunk).all<{ id: string; company_norm: string; title_norm: string; location_norm: string | null; dedup_key: string }>();
          if (keyMatches) candidates.push(...keyMatches);
        }

        // For single-company boards, also pre-load by company_norm for fuzzy Stage 2.
        const uniqueCompanies = [...new Set(allNormalized.map(n => n.companyNorm))];
        if (uniqueCompanies.length === 1 && uniqueCompanies[0]) {
          const { results: companyMatches } = await env.DB.prepare(
            'SELECT id, company_norm, title_norm, location_norm, dedup_key FROM canonical_jobs WHERE company_norm = ?'
          ).bind(uniqueCompanies[0]).all<{ id: string; company_norm: string; title_norm: string; location_norm: string | null; dedup_key: string }>();
          if (companyMatches) {
            const existingIds = new Set(candidates.map(c => c.id));
            candidates.push(...companyMatches.filter(r => !existingIds.has(r.id)));
          }
        }
      }

      const statements: any[] = [];
      // Collect new jobs for batched embedding after D1 writes
      const newJobsForEmbedding: Array<{ canonicalId: string; normalized: ReturnType<typeof normalizeJob> }> = [];

      for (let jobIdx = 0; jobIdx < rawJobs.length; jobIdx++) {
        const rawJob = rawJobs[jobIdx];
        const normalized = allNormalized[jobIdx];

        // Run deduplication pipeline with pre-loaded candidates
        const decision = await dedupPipeline(env, normalized, candidates);

        let canonicalId = decision.canonicalId;
        const isNew = decision.action === 'insert_new' || !canonicalId;

        if (isNew) {
          canonicalId = crypto.randomUUID();
          statements.push(prepareInsertCanonicalJob(env, canonicalId, normalized));

          // Add to in-memory candidates so subsequent jobs in this batch can dedup against it
          candidates.push({
            id: canonicalId,
            company_norm: normalized.companyNorm,
            title_norm: normalized.titleNorm,
            location_norm: normalized.locationNorm ?? null,
            dedup_key: normalized.dedupKey
          });

          newJobsForEmbedding.push({ canonicalId, normalized });
          insertedCount++;
        } else {
          mergedCount++;
          statements.push(env.DB.prepare(
            'UPDATE canonical_jobs SET last_seen_at = ?, updated_at = ? WHERE id = ?'
          ).bind(new Date().toISOString(), new Date().toISOString(), canonicalId));
        }

        // Link job source
        const sourceId = crypto.randomUUID();
        statements.push(prepareLinkJobSource(env, canonicalId!, sourceId, {
          ats,
          boardToken: token,
          sourceJobId: rawJob.id,
          sourceUrl: rawJob.absoluteUrl || rawJob.applyUrl || '',
          applyUrl: rawJob.applyUrl || rawJob.absoluteUrl || '',
          rawHash: normalized.rawHash,
        }));
      }

      // Execute batch statements in chunks of 100 (D1 batch limit)
      if (statements.length > 0) {
        console.log(`[queue-handler] Executing batch of ${statements.length} D1 statements...`);
        const chunkSize = 100;
        for (let i = 0; i < statements.length; i += chunkSize) {
          await env.DB.batch(statements.slice(i, i + chunkSize));
        }
      }

      // Enqueue scoring for newly-inserted jobs — decoupled from the crawl so a
      // slow/failed AI call never blocks or retries the crawl itself.
      if (env.JOB_SCORE_QUEUE && newJobsForEmbedding.length > 0) {
        for (const { canonicalId } of newJobsForEmbedding) {
          await enqueueJobScore(env.JOB_SCORE_QUEUE, { canonicalJobId: canonicalId });
        }
      }

      // Batch-embed new jobs after D1 writes succeed.
      if (newJobsForEmbedding.length > 0) {
        try {
          const { embedJob, upsertVector } = await import('../dedup/embedding');
          const { withRetry } = await import('@/lib/sync-queue');
          
          for (const { canonicalId, normalized } of newJobsForEmbedding) {
            try {
              await withRetry(
                async () => {
                  const vector = await embedJob(env, normalized);
                  await upsertVector(env, canonicalId, normalized.companyNorm, vector);
                },
                {
                  maxRetries: 3,
                  baseDelayMs: 2000,
                  onRetry: (attempt, err) => {
                    console.warn(`[queue-handler] Rate limit or error embedding for ${canonicalId}, retrying attempt ${attempt}...`, err);
                  }
                }
              );
            } catch (embedErr) {
              console.error(`[queue-handler] Embedding failed for ${canonicalId} after retries:`, embedErr);
            }
          }
        } catch (embedImportErr) {
          console.error('[queue-handler] Failed to import embedding module:', embedImportErr);
        }
      }

      // 4. Update boards table
      const nowString = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE boards 
        SET last_crawled_at = ?, crawl_error_count = 0, crawl_error_last_at = null
        WHERE id = ?
      `).bind(nowString, boardId).run();

      await logAudit(env, {
        eventType: 'crawl_complete',
        ats,
        boardToken: token,
        details: { boardId, crawlUuid: uuid, fetchedJobs: rawJobs.length, insertedCount, mergedCount },
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[queue-handler] Error during crawl for ${ats}/${token}: ${errorMsg}`);
      
      const is404 = errorMsg.toLowerCase().includes('404') || errorMsg.toLowerCase().includes('not found');
      
      try {
        const nowString = new Date().toISOString();
        if (is404) {
          // Deactivate the board to prevent further queue/spam retries
          await env.DB.prepare(`
            UPDATE boards 
            SET crawl_error_count = crawl_error_count + 1, 
                crawl_error_last_at = ?,
                is_active = 0
            WHERE id = ?
          `).bind(nowString, boardId).run();
          console.warn(`[queue-handler] Deactivated dead board ${ats}/${token} due to 404 error`);
        } else {
          await env.DB.prepare(`
            UPDATE boards 
            SET crawl_error_count = crawl_error_count + 1, crawl_error_last_at = ?
            WHERE id = ?
          `).bind(nowString, boardId).run();
        }

        await logAudit(env, {
          eventType: 'error',
          ats,
          boardToken: token,
          details: { boardId, crawlUuid: uuid, error: errorMsg, deactivated: is404 },
        });
      } catch (dbErr) {
        console.error(`[queue-handler] Failed to write crawl error to DB: ${dbErr}`);
      }

      if (!is404) {
        // Let Wrangler Queue retry this message according to retry policy
        message.retry();
      }
    }
  }
}

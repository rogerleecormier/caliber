import { fetchGreenhouseJobs } from '../ats/parsers/greenhouse';
import { fetchLeverJobs } from '../ats/parsers/lever';
import { fetchAshbyJobs } from '../ats/parsers/ashby';
import { fetchWorkableJobs } from '../ats/parsers/workable';
import { 
  insertCanonicalJob, 
  linkJobSource, 
  logAudit,
  prepareInsertCanonicalJob,
  prepareLinkJobSource,
  prepareLogAudit
} from '../db/queries';
import { normalizeJob } from '@/lib/normalization';
import { dedupPipeline } from '../dedup/deterministic';

export interface CrawlMessage {
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workable';
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
      if (ats === 'lever') domain = 'api.lever.co';
      if (ats === 'ashby') domain = 'api.ashbyhq.com';
      if (ats === 'workable') domain = 'apply.workable.com';

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

      // 2. Fetch jobs from ATS
      let rawJobs: any[] = [];
      if (ats === 'greenhouse') {
        rawJobs = await fetchGreenhouseJobs(token, companyName);
      } else if (ats === 'lever') {
        rawJobs = await fetchLeverJobs(token, companyName);
      } else if (ats === 'ashby') {
        rawJobs = await fetchAshbyJobs(token, companyName);
      } else if (ats === 'workable') {
        rawJobs = await fetchWorkableJobs(token, companyName);
      }

      console.log(`[queue-handler] Fetched ${rawJobs.length} jobs for ${ats}/${token}`);

      // 3. Process jobs and dedup (Stage 1 only for Phase 2)
      let insertedCount = 0;
      let mergedCount = 0;

      // Pre-load candidates for this company to avoid sequential DB queries per job
      let companyNorm = '';
      if (rawJobs.length > 0) {
        const firstNormalized = normalizeJob(rawJobs[0]);
        companyNorm = firstNormalized.companyNorm;
      }

      const candidates: Array<{ id: string; company_norm: string; title_norm: string; location_norm: string | null; dedup_key: string }> = [];
      if (companyNorm) {
        const { results } = await env.DB.prepare(
          'SELECT id, company_norm, title_norm, location_norm, dedup_key FROM canonical_jobs WHERE company_norm = ?'
        ).bind(companyNorm).all<{ id: string; company_norm: string; title_norm: string; location_norm: string | null; dedup_key: string }>();
        if (results) {
          candidates.push(...results);
        }
      }

      const statements: any[] = [];

      for (const rawJob of rawJobs) {
        const normalized = normalizeJob(rawJob);
        
        // Run deduplication pipeline with pre-loaded candidates
        const decision = await dedupPipeline(env, normalized, candidates);
        
        let canonicalId = decision.canonicalId;
        const isNew = decision.action === 'insert_new' || !canonicalId;

        if (isNew) {
          canonicalId = crypto.randomUUID();
          statements.push(prepareInsertCanonicalJob(env, canonicalId, normalized));
          
          // Add newly inserted job to the in-memory candidates list for subsequent jobs matching
          candidates.push({
            id: canonicalId,
            company_norm: normalized.companyNorm,
            title_norm: normalized.titleNorm,
            location_norm: normalized.locationNorm ?? null,
            dedup_key: normalized.dedupKey
          });
          
          // Generate and upsert embedding to Vectorize index
          try {
            const { embedJob, upsertVector } = await import('../dedup/embedding');
            const vector = await embedJob(env, normalized);
            await upsertVector(env, canonicalId, normalized.companyNorm, vector);
          } catch (embedErr) {
            console.error(`[queue-handler] Failed to generate/upsert embedding for ${canonicalId}:`, embedErr);
          }
          
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

        // Log audit event
        statements.push(prepareLogAudit(env, crypto.randomUUID(), {
          eventType: isNew ? 'vector_insert' : 'dedup_merge',
          ats,
          boardToken: token,
          canonicalId: canonicalId!,
          sourceId,
          details: {
            stage: decision.stage,
            score: decision.score ?? null,
            method: isNew ? 'insert' : (decision.stage === 1 ? 'deterministic' : (decision.stage === 2 ? 'fuzzy' : (decision.stage === 3 ? 'vector' : 'llm'))),
            dedupKey: normalized.dedupKey
          },
        }));
      }

      // Execute batch statements in chunks
      if (statements.length > 0) {
        console.log(`[queue-handler] Executing batch of ${statements.length} D1 statements...`);
        const chunkSize = 100;
        for (let i = 0; i < statements.length; i += chunkSize) {
          const chunk = statements.slice(i, i + chunkSize);
          await env.DB.batch(chunk);
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
      
      try {
        const nowString = new Date().toISOString();
        await env.DB.prepare(`
          UPDATE boards 
          SET crawl_error_count = crawl_error_count + 1, crawl_error_last_at = ?
          WHERE id = ?
        `).bind(nowString, boardId).run();

        await logAudit(env, {
          eventType: 'error',
          ats,
          boardToken: token,
          details: { boardId, crawlUuid: uuid, error: errorMsg },
        });
      } catch (dbErr) {
        console.error(`[queue-handler] Failed to write crawl error to DB: ${dbErr}`);
      }

      // Let Wrangler Queue retry this message according to retry policy
      message.retry();
    }
  }
}

import { fetchGreenhouseJobs } from '../ats/parsers/greenhouse';
import { fetchLeverJobs } from '../ats/parsers/lever';
import { fetchAshbyJobs } from '../ats/parsers/ashby';
import { insertCanonicalJob, linkJobSource, logAudit } from '../db/queries';
import { normalizeJob } from '@/lib/normalization';
import { dedupPipeline } from '../dedup/deterministic';

export interface CrawlMessage {
  ats: 'greenhouse' | 'lever' | 'ashby';
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
      }

      console.log(`[queue-handler] Fetched ${rawJobs.length} jobs for ${ats}/${token}`);

      // 3. Process jobs and dedup (Stage 1 only for Phase 2)
      let insertedCount = 0;
      let mergedCount = 0;

      for (const rawJob of rawJobs) {
        const normalized = normalizeJob(rawJob);
        
        // Run deduplication pipeline
        const decision = await dedupPipeline(env, normalized);
        
        let canonicalId = decision.canonicalId;
        const isNew = decision.action === 'insert_new' || !canonicalId;

        if (isNew) {
          canonicalId = crypto.randomUUID();
          await insertCanonicalJob(env, canonicalId, normalized);
          
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
        }

        // Link job source
        const sourceId = await linkJobSource(env, canonicalId!, {
          ats,
          boardToken: token,
          sourceJobId: rawJob.id,
          sourceUrl: rawJob.absoluteUrl || rawJob.applyUrl || '',
          applyUrl: rawJob.applyUrl || rawJob.absoluteUrl || '',
          rawHash: normalized.rawHash,
        });

        // Log audit event
        await logAudit(env, {
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
        });
      }

      // 4. Update boards table
      const nowString = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE boards 
        SET last_crawled_at = ?, crawl_error_count = 0, crawl_error_last_at = NULL
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

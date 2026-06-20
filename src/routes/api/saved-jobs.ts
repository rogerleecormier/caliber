import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';
import { getDb } from '@/db/db';
import { masterResume, normalizedJobs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveSessionUser } from '@/lib/resolve-user';
import { normalizeJob } from '@/lib/normalization';
import { dedupPipeline } from '@/server/dedup/deterministic';
import { insertCanonicalJob, linkJobSource } from '@/server/db/queries';
import { scoreJobAgainstProfile } from '@/lib/ai/job-score';
import { canonicalizeJobUrl } from '@/lib/normalized-jobs-persistence';
import type { AtsJobResponse } from '@/types/crawler';

export const Route = createFileRoute('/api/saved-jobs')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await resolveSessionUser(request);
          if (!user) {
            return json({ success: false, error: 'Unauthorized' }, { status: 401 });
          }

          const job = await request.json() as any;
          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database unavailable' }, { status: 500 });
          }
          const db = getDb(env.DB);

          // 1. Format to AtsJobResponse
          const rawJobResponse: AtsJobResponse = {
            id: job.id || crypto.randomUUID(),
            title: job.title || '',
            company: job.company || '',
            location: job.location || undefined,
            description: job.description || job.snippet || undefined,
            absoluteUrl: job.jobUrl || job.sourceUrl || '',
            applyUrl: job.jobUrl || job.sourceUrl || '',
            publishedAt: job.postedDate || job.postDateText || undefined,
            raw: job,
          };

          // 2. Normalize and Deduplicate
          const normalized = normalizeJob(rawJobResponse);
          const decision = await dedupPipeline(env as any, normalized);
          
          let canonicalId = decision.canonicalId;
          if (!canonicalId) {
            canonicalId = crypto.randomUUID();
            await insertCanonicalJob(env as any, canonicalId, normalized);
            
            // generate embedding
            try {
              const { embedJob, upsertVector } = await import('@/server/dedup/embedding');
              const vector = await embedJob(env as any, normalized);
              await upsertVector(env as any, canonicalId, normalized.companyNorm, vector);
            } catch (e) {
              console.warn('[saved-jobs] Failed to generate/upsert embedding:', e);
            }
          }

          // Link source
          await linkJobSource(env as any, canonicalId, {
            ats: job.source || 'quick_search',
            boardToken: 'quick_search',
            sourceJobId: job.id || crypto.randomUUID(),
            sourceUrl: job.jobUrl || job.sourceUrl || `https://caliber.internal/jobs/canonical/${canonicalId}`,
            applyUrl: job.jobUrl || job.sourceUrl || `https://caliber.internal/jobs/canonical/${canonicalId}`,
            rawHash: normalized.rawHash,
          });

          // 3. Fetch user resume for scoring
          const resumeRows = await db
            .select({ rawText: masterResume.rawText })
            .from(masterResume)
            .where(eq(masterResume.userId, user.id))
            .limit(1);
          const resumeText = resumeRows[0]?.rawText || '';

          // 4. Perform AI scoring if resume is present
          let scores = {
            atsScore: 50,
            careerScore: 50,
            outlookScore: 50,
            masterScore: 50,
            atsReason: 'Resume unavailable for scoring.',
            careerReason: 'Resume unavailable for scoring.',
            outlookReason: 'Resume unavailable for scoring.',
            isUnicorn: false,
            unicornReason: null as string | null,
          };
          if (resumeText) {
            try {
              scores = await scoreJobAgainstProfile(env.AI, resumeText, {
                id: canonicalId,
                title: job.title || '',
                description: job.description || job.snippet || '',
              });
            } catch (scoreErr) {
              console.error('[saved-jobs] Scoring failed:', scoreErr);
            }
          }

          // 5. Upsert to normalized_jobs with isFavorited = true
          const canonicalUrl = canonicalizeJobUrl(job.jobUrl || job.sourceUrl || `https://caliber.internal/jobs/canonical/${canonicalId}`);
          const now = new Date().toISOString();

          const [existing] = await db
            .select()
            .from(normalizedJobs)
            .where(
              and(
                eq(normalizedJobs.userId, user.id),
                eq(normalizedJobs.canonicalSourceUrl, canonicalUrl)
              )
            )
            .limit(1);

          if (existing) {
            await db
              .update(normalizedJobs)
              .set({
                canonicalJobId: canonicalId,
                isFavorited: true,
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
              userId: user.id,
              canonicalJobId: canonicalId,
              isFavorited: true,
              sourceOrigin: job.source || 'quick_search',
              jobTitle: job.title || '',
              employerName: job.company || '',
              location: job.location || null,
              sourceUrl: job.jobUrl || job.sourceUrl || '',
              canonicalSourceUrl: canonicalUrl,
              description: job.description || null,
              snippet: job.snippet || null,
              salary: job.salary || null,
              postDateText: job.postedDate || job.postDateText || null,
              workplaceType: job.workplaceType || null,
              remoteType: job.workplaceType === 'remote' ? 'fully_remote' : 'unspecified',
              currentStage: 'Favorited',
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

          return json({ success: true, id: canonicalId });
        } catch (error) {
          console.error('[saved-jobs-api] Error saving job:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});

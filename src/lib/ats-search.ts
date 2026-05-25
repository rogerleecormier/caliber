import { getDb, schema } from '@/db/db';
import { and, inArray, like } from 'drizzle-orm';
import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';

/**
 * Search local Greenhouse, Lever, and Workable jobs cache using keyword matching
 */
export async function searchAtsJobs(
  db: ReturnType<typeof getDb>,
  sources: string[],
  criteria: LinkedInSearchParams
): Promise<LinkedInScrapedJob[]> {
  const activeAtsSources: string[] = [];
  if (sources.includes('greenhouse')) activeAtsSources.push('Greenhouse');
  if (sources.includes('lever')) activeAtsSources.push('Lever');
  if (sources.includes('workable')) activeAtsSources.push('Workable');

  if (activeAtsSources.length === 0 || !criteria.keywords) {
    return [];
  }

  const matchedAtsJobs = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        inArray(schema.jobs.sourceName, activeAtsSources),
        like(schema.jobs.title, `%${criteria.keywords}%`)
      )
    );

  return matchedAtsJobs.map((job) => ({
    id: `ats-${job.id}`,
    title: job.title,
    company: job.company || 'Unknown',
    location: 'Remote',
    sourceUrl: job.sourceUrl,
    sourceName: job.sourceName as any,
    postDateText: job.postDate ? new Date(job.postDate).toLocaleDateString() : null,
    workplaceType: 'remote',
    salary: job.payRange || null,
    snippet: job.descriptionRaw ? job.descriptionRaw.substring(0, 300) : null,
    description: job.descriptionRaw || null,
  }));
}

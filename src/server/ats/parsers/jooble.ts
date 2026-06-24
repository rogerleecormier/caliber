import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const JoobleJobSchema = z.object({
  id: z.number(),  // API returns numeric id
  title: z.string(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  link: z.string(),
  snippet: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  updated: z.string().nullable().optional(),  // ISO date string, not unix timestamp
});

const JoobleApiResponseSchema = z.object({
  jobs: z.array(JoobleJobSchema),
});

export async function fetchJoobleJobs(
  boardToken: string,
  _companyName: string | undefined,
  env: { JOOBLE_API_KEY?: string },
): Promise<AtsJobResponse[]> {
  const apiKey = env.JOOBLE_API_KEY;
  if (!apiKey) {
    console.warn('[jooble-parser] JOOBLE_API_KEY not set, skipping');
    return [];
  }

  const keywords = decodeURIComponent(boardToken);
  const response = await fetch(`https://jooble.org/api/${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
    body: JSON.stringify({ keywords, location: 'remote', resultsOnPage: 50 }),
  });

  if (!response.ok) {
    throw new Error(`Jooble API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = JoobleApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => ({
    id: `jooble-${job.id}`,
    title: job.title,
    company: job.company ?? undefined,
    location: job.location || 'Remote',
    description: job.snippet ?? undefined,
    employmentType: job.type ?? undefined,
    absoluteUrl: job.link,
    applyUrl: job.link,
    publishedAt: job.updated ?? undefined,
    raw: job as any,
  }));
}

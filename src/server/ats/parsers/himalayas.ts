import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const HimalayasJobSchema = z.object({
  // API uses 'guid' (a URL string) — no numeric 'id' field
  guid: z.string().optional(),
  title: z.string(),
  companyName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  applicationLink: z.string().nullable().optional(),
  pubDate: z.number().nullable().optional(),
  minSalary: z.number().nullable().optional(),
  maxSalary: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  locationRestrictions: z.array(z.string()).nullable().optional(),
});

const HimalayasApiResponseSchema = z.object({
  jobs: z.array(HimalayasJobSchema),
});

export async function fetchHimalayasJobs(
  boardToken: string,
): Promise<AtsJobResponse[]> {
  const offset = parseInt(boardToken, 10) || 0;
  const url = `https://himalayas.app/jobs/api?limit=20&offset=${offset}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Himalayas API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = HimalayasApiResponseSchema.parse(data);

  return parsed.jobs
    .filter(job => job.applicationLink)
    .map((job) => {
      const absoluteUrl = job.applicationLink!;
      const publishedAt = job.pubDate ? new Date(job.pubDate * 1000).toISOString() : undefined;
      // Use guid or applicationLink as stable ID
      const id = `himalayas-${encodeURIComponent(job.guid || absoluteUrl)}`;
      const location = job.locationRestrictions?.join(', ') || 'Remote';

      return {
        id,
        title: job.title,
        company: job.companyName ?? undefined,
        location,
        description: job.description ?? undefined,
        compensation: job.minSalary || job.maxSalary ? {
          min: job.minSalary ?? undefined,
          max: job.maxSalary ?? undefined,
          currency: job.currency ?? 'USD',
        } : undefined,
        absoluteUrl,
        applyUrl: absoluteUrl,
        publishedAt,
        raw: job as any,
      };
    });
}

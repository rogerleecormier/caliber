import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const AshbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  isRemote: z.boolean().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  jobUrl: z.string(),
  applyUrl: z.string(),
  descriptionHtml: z.string().nullable().optional(),
  descriptionPlain: z.string().nullable().optional(),
  compensation: z.object({
    summary: z.string().nullable().optional(),
    minValue: z.number().nullable().optional(),
    maxValue: z.number().nullable().optional(),
    currencyCode: z.string().nullable().optional(),
  }).nullable().optional(),
});

const AshbyApiResponseSchema = z.object({
  jobs: z.array(AshbyJobSchema)
});

export async function fetchAshbyJobs(
  boardToken: string,
  companyName?: string
): Promise<AtsJobResponse[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${boardToken}?includeCompensation=true`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Ashby API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = AshbyApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => ({
    id: job.id,
    title: job.title,
    company: companyName || boardToken,
    location: job.location ?? undefined,
    description: job.descriptionPlain || job.descriptionHtml || undefined,
    compensation: job.compensation ? {
      min: job.compensation.minValue ?? undefined,
      max: job.compensation.maxValue ?? undefined,
      currency: job.compensation.currencyCode ?? undefined,
    } : undefined,
    employmentType: job.employmentType ?? undefined,
    department: job.department ?? undefined,
    team: job.team ?? undefined,
    absoluteUrl: job.jobUrl,
    applyUrl: job.applyUrl,
    publishedAt: job.publishedAt ?? undefined,
    raw: job as any,
  }));
}

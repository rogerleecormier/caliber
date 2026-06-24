import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';
import { decodeHtmlEntities } from '@/lib/html-utils';

const JobicyJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  jobTitle: z.string(),
  companyName: z.string().nullable().optional(),
  url: z.string(),
  pubDate: z.string().nullable().optional(),
  jobDescription: z.string().nullable().optional(),
  jobExcerpt: z.string().nullable().optional(),
  annualSalaryMin: z.number().nullable().optional(),
  annualSalaryMax: z.number().nullable().optional(),
  salaryCurrency: z.string().nullable().optional(),
  jobType: z.string().nullable().optional(),
});

const JobicyApiResponseSchema = z.object({
  jobs: z.array(JobicyJobSchema),
});

export async function fetchJobicyJobs(
  boardToken: string,
): Promise<AtsJobResponse[]> {
  const url = `https://jobicy.com/api/v2/remote-jobs?count=50&industry=${encodeURIComponent(boardToken)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Jobicy API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = JobicyApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => {
    const title = decodeHtmlEntities(job.jobTitle);
    const company = job.companyName ? decodeHtmlEntities(job.companyName) : undefined;
    const description = job.jobDescription || job.jobExcerpt || undefined;

    return {
      id: String(job.id),
      title,
      company,
      location: 'Remote',
      description,
      compensation: job.annualSalaryMin || job.annualSalaryMax ? {
        min: job.annualSalaryMin ?? undefined,
        max: job.annualSalaryMax ?? undefined,
        currency: job.salaryCurrency ?? 'USD',
      } : undefined,
      employmentType: job.jobType ?? undefined,
      absoluteUrl: job.url,
      applyUrl: job.url,
      publishedAt: job.pubDate ?? undefined,
      raw: job as any,
    };
  });
}

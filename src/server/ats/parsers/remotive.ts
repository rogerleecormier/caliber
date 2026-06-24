import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const RemotiveJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  company_name: z.string(),
  location: z.string().nullable().optional(),
  url: z.string(),
  publication_date: z.string().nullable().optional(),
  job_type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  // API returns salary as a plain string like "$80k - $100k", not an object
  salary: z.union([
    z.string(),
    z.object({
      from: z.number().nullable().optional(),
      to: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
    }),
  ]).nullable().optional(),
});

const RemotiveApiResponseSchema = z.object({
  jobs: z.array(RemotiveJobSchema),
});

export async function fetchRemotiveJobs(
  boardToken: string,
): Promise<AtsJobResponse[]> {
  const keywords = decodeURIComponent(boardToken);
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keywords)}&limit=50`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Remotive API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = RemotiveApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => {
    // Salary may be a string ("$80k - $100k") or an object — pass string as-is to compensation-less path
    const salaryObj = typeof job.salary === 'object' && job.salary !== null ? job.salary : null;

    return {
      id: `remotive-${job.id}`,
      title: job.title,
      company: job.company_name,
      location: job.location || 'Remote',
      description: job.description ?? undefined,
      compensation: salaryObj?.from || salaryObj?.to ? {
        min: salaryObj.from ?? undefined,
        max: salaryObj.to ?? undefined,
        currency: salaryObj.currency ?? 'USD',
      } : undefined,
      employmentType: job.job_type ?? undefined,
      absoluteUrl: job.url,
      applyUrl: job.url,
      publishedAt: job.publication_date ?? undefined,
      raw: job as any,
    };
  });
}

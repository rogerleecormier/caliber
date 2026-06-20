import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const LeverJobSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.union([z.number(), z.string()]).optional(),
  hostedUrl: z.string(),
  applyUrl: z.string(),
  categories: z.object({
    team: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    commitment: z.string().nullable().optional(),
  }).nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionPlain: z.string().nullable().optional(),
  additional: z.string().nullable().optional(),
  additionalPlain: z.string().nullable().optional(),
  salaryRange: z.object({
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
  }).nullable().optional(),
});

export async function fetchLeverJobs(
  boardToken: string,
  companyName?: string
): Promise<AtsJobResponse[]> {
  const url = `https://api.lever.co/v0/postings/${boardToken}?mode=json`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Lever API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = z.array(LeverJobSchema).parse(data);

  return parsed.map((job) => {
    // Combine description and additional sections for full content
    const descHtml = (job.description || '') + (job.additional ? `\n\n${job.additional}` : '');
    const descPlain = (job.descriptionPlain || '') + (job.additionalPlain ? `\n\n${job.additionalPlain}` : '');
    
    return {
      id: job.id,
      title: job.text,
      company: companyName || boardToken,
      location: job.categories?.location ?? undefined,
      description: descPlain || descHtml || undefined,
      compensation: job.salaryRange ? {
        min: job.salaryRange.min ?? undefined,
        max: job.salaryRange.max ?? undefined,
        currency: job.salaryRange.currency ?? undefined,
      } : undefined,
      employmentType: job.categories?.commitment ?? undefined,
      department: job.categories?.department ?? undefined,
      team: job.categories?.team ?? undefined,
      absoluteUrl: job.hostedUrl,
      applyUrl: job.applyUrl,
      publishedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      raw: job as any,
    };
  });
}

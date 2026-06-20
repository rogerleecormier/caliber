import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const GreenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  location: z.object({
    name: z.string().nullable().optional()
  }).nullable().optional(),
  absolute_url: z.string().optional(),
  content: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  departments: z.array(z.object({
    name: z.string()
  })).nullable().optional(),
});

const GreenhouseApiResponseSchema = z.object({
  jobs: z.array(GreenhouseJobSchema)
});

export async function fetchGreenhouseJobs(
  boardToken: string,
  companyName?: string
): Promise<AtsJobResponse[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Greenhouse API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = GreenhouseApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => {
    const dept = job.departments && job.departments[0] ? job.departments[0].name : undefined;
    return {
      id: String(job.id),
      title: job.title,
      company: companyName || boardToken,
      location: job.location?.name ?? undefined,
      description: job.content ?? undefined,
      absoluteUrl: job.absolute_url,
      applyUrl: job.absolute_url ? `${job.absolute_url}#app` : undefined,
      department: dept,
      updatedAt: job.updated_at ?? undefined,
      raw: job as any,
    };
  });
}

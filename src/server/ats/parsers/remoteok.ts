import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const RemoteOKJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  position: z.string(),
  company: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
});

export async function fetchRemoteOKJobs(
  boardToken: string,
): Promise<AtsJobResponse[]> {
  const url = `https://remoteok.com/api?tag=${encodeURIComponent(boardToken)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`RemoteOK API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as unknown[];

  // First element is always a metadata object, not a job — skip it
  const jobs = (Array.isArray(data) ? data.slice(1) : [])
    .map((item) => {
      const parsed = RemoteOKJobSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
    })
    .filter((j): j is z.infer<typeof RemoteOKJobSchema> => j !== null && !!j.position);

  return jobs.map((job) => {
    const id = String(job.id);
    const absoluteUrl = job.url || `https://remoteok.com/l/${id}`;
    return {
      id,
      title: job.position,
      company: job.company ?? undefined,
      location: 'Remote',
      description: job.description ?? undefined,
      compensation: job.salary_min || job.salary_max ? {
        min: job.salary_min ?? undefined,
        max: job.salary_max ?? undefined,
        currency: 'USD',
      } : undefined,
      absoluteUrl,
      applyUrl: absoluteUrl,
      publishedAt: job.date ?? undefined,
      raw: job as any,
    };
  });
}

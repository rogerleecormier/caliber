import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const WorkableJobSchema = z.object({
  shortcode: z.string(),
  title: z.string(),
  department: z.string().nullable().optional(),
  url: z.string(),
  application_url: z.string().nullable().optional(),
  telecommuting: z.boolean().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

const WorkableApiResponseSchema = z.object({
  name: z.string().nullable().optional(),
  jobs: z.array(WorkableJobSchema),
});

export async function fetchWorkableJobs(
  boardToken: string,
  companyName?: string
): Promise<AtsJobResponse[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${boardToken}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Workable API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = WorkableApiResponseSchema.parse(data);

  return parsed.jobs.map((job) => {
    const locParts = [job.city, job.state, job.country].filter(Boolean);
    let locationStr = locParts.join(', ') || 'Remote';
    if (job.telecommuting) {
      locationStr = locationStr === 'Remote' ? 'Remote' : `${locationStr} (Remote)`;
    }

    return {
      id: job.shortcode,
      title: job.title,
      company: companyName || parsed.name || boardToken,
      location: locationStr,
      description: undefined, // Workable widget API does not return description, scraped dynamically if needed
      department: job.department ?? undefined,
      absoluteUrl: job.url,
      applyUrl: job.application_url || job.url,
      publishedAt: job.created_at ?? undefined,
      raw: job as any,
    };
  });
}

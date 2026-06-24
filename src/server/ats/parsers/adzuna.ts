import { z } from 'zod';
import type { AtsJobResponse } from '@/types/crawler';

const AdzunaJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.object({ display_name: z.string() }).nullable().optional(),
  location: z.object({ display_name: z.string() }).nullable().optional(),
  redirect_url: z.string(),
  created: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency_code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contract_type: z.string().nullable().optional(),
});

const AdzunaApiResponseSchema = z.object({
  results: z.array(AdzunaJobSchema),
});

export async function fetchAdzunaJobs(
  boardToken: string,
  _companyName: string | undefined,
  env: { ADZUNA_APP_ID?: string; ADZUNA_APP_KEY?: string; ADZUNA_API_KEY?: string },
): Promise<AtsJobResponse[]> {
  // Support both ADZUNA_APP_ID+ADZUNA_APP_KEY (separate secrets) and
  // the legacy ADZUNA_API_KEY combined "app_id:app_key" format
  let appId: string | undefined;
  let appKey: string | undefined;

  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
    appId = env.ADZUNA_APP_ID;
    appKey = env.ADZUNA_APP_KEY;
  } else if (env.ADZUNA_API_KEY) {
    [appId, appKey] = env.ADZUNA_API_KEY.split(':');
  }

  if (!appId || !appKey) {
    console.warn('[adzuna-parser] Missing ADZUNA_APP_ID/ADZUNA_APP_KEY, skipping');
    return [];
  }

  const keywords = decodeURIComponent(boardToken);
  const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  // Append "remote" to the keyword query — Adzuna doesn't understand where=remote as a location
  url.searchParams.set('what', `${keywords} remote`);
  url.searchParams.set('results_per_page', '50');
  url.searchParams.set('content-type', 'application/json');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = AdzunaApiResponseSchema.parse(data);

  return parsed.results.map((job) => ({
    id: `adzuna-${job.id}`,
    title: job.title,
    company: job.company?.display_name ?? undefined,
    location: job.location?.display_name ?? 'Remote',
    description: job.description ?? undefined,
    compensation: job.salary_min || job.salary_max ? {
      min: job.salary_min ?? undefined,
      max: job.salary_max ?? undefined,
      currency: job.salary_currency_code ?? 'USD',
    } : undefined,
    employmentType: job.contract_type ?? undefined,
    absoluteUrl: job.redirect_url,
    applyUrl: job.redirect_url,
    publishedAt: job.created ?? undefined,
    raw: job as any,
  }));
}

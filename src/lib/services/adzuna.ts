import { AdzunaJob, UnifiedJob } from './types';
import { getCached, setCached, hashQuery } from './cache';

interface AdzunaSearchParams {
  what?: string;
  where?: string;
  country?: string;
  results_per_page?: number;
  page?: number;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

export class AdzunaService {
  private apiKey: string;
  private baseUrl = 'https://api.adzuna.com/v1/api/jobs';
  private kv: any; // KVNamespace from Cloudflare Workers
  private cacheTtl: number;

  constructor(apiKey: string, kv: any, cacheTtlSeconds = 3600) {
    this.apiKey = apiKey;
    this.kv = kv;
    this.cacheTtl = cacheTtlSeconds;
  }

  async search(params: AdzunaSearchParams): Promise<UnifiedJob[]> {
    if (!this.apiKey) {
      throw new Error('Adzuna API key not configured');
    }

    // Try cache first if KV is available
    if (this.kv) {
      const cacheKey = `adzuna:${await hashQuery(params as Record<string, unknown>)}`;
      const cached = await getCached<UnifiedJob[]>(this.kv, cacheKey);
      if (cached) return cached;
    }

    const queryParams = new URLSearchParams({
      app_id: this.apiKey.split(':')[0],
      app_key: this.apiKey.split(':')[1],
      results_per_page: String(params.results_per_page || 50),
    });

    // Note: Adzuna API doesn't support pagination via 'page' parameter
    // if (params.page) queryParams.append('page', String(params.page));

    if (params.what) queryParams.append('what', params.what);
    // Note: Skipping location parameter as it seems to cause 400 errors with certain values
    // Users can still search by keyword

    const response = await fetch(`${this.baseUrl}/${params.country || 'us'}/search?${queryParams}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as AdzunaResponse;
    const unified = data.results.map((job) => this.mapToUnified(job));

    // Cache results if KV is available
    if (this.kv) {
      const cacheKey = `adzuna:${await hashQuery(params as Record<string, unknown>)}`;
      await setCached(this.kv, cacheKey, unified, this.cacheTtl);
    }

    return unified;
  }

  private mapToUnified(job: AdzunaJob): UnifiedJob {
    return {
      id: job.job_id,
      title: job.job_title,
      company: job.company.display_name,
      location: job.location.display_name,
      jobUrl: job.redirect_url,
      source: 'adzuna',
      postedDate: job.created ? new Date(job.created) : undefined,
      salary: job.salary_min || job.salary_max ? {
        min: job.salary_min,
        max: job.salary_max,
        currency: job.salary_currency_code,
      } : undefined,
      description: job.description,
      jobType: job.contract_type as UnifiedJob['jobType'],
      rawData: job,
    };
  }
}

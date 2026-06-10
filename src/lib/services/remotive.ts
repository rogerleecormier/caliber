import { RemotiveJob, UnifiedJob } from './types';
import { getCached, setCached, hashQuery } from './cache';

interface RemotiveSearchParams {
  search?: string;
  job_types?: string[];
  limit?: number;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export class RemotiveService {
  private baseUrl = 'https://remotive.com/api/remote-jobs';
  private kv: any; // KVNamespace from Cloudflare Workers
  private cacheTtl: number;

  constructor(kv: any, cacheTtlSeconds = 3600) {
    this.kv = kv;
    this.cacheTtl = cacheTtlSeconds;
  }

  async search(params: RemotiveSearchParams): Promise<UnifiedJob[]> {
    // Try cache first if KV is available
    if (this.kv) {
      const cacheKey = `remotive:${await hashQuery(params as Record<string, unknown>)}`;
      const cached = await getCached<UnifiedJob[]>(this.kv, cacheKey);
      if (cached) return cached;
    }

    const queryParams = new URLSearchParams({
      limit: String(params.limit || 50),
    });

    if (params.search) {
      queryParams.append('search', params.search);
    }

    if (params.job_types && params.job_types.length > 0) {
      queryParams.append('job_types', params.job_types.join(','));
    }

    const response = await fetch(`${this.baseUrl}?${queryParams}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Remotive API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RemotiveResponse;
    const unified = data.jobs.map((job) => this.mapToUnified(job));

    // Cache results if KV is available
    if (this.kv) {
      const cacheKey = `remotive:${await hashQuery(params as Record<string, unknown>)}`;
      await setCached(this.kv, cacheKey, unified, this.cacheTtl);
    }

    return unified;
  }

  private mapToUnified(job: RemotiveJob): UnifiedJob {
    return {
      id: String(job.id),
      title: job.title,
      company: job.company_name,
      location: job.location,
      jobUrl: job.url,
      source: 'remotive',
      postedDate: new Date(job.publication_date),
      description: job.description,
      jobType: job.job_type,
      salary: job.salary ? {
        min: job.salary.from,
        max: job.salary.to,
        currency: job.salary.currency,
      } : undefined,
      remote: true,
      rawData: job,
    };
  }
}

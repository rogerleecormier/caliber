import { UnifiedJob, JobServiceOptions } from './types';
import { AdzunaService } from './adzuna';
import { JoobleService } from './jooble';
import { RemotiveService } from './remotive';

interface AggregationParams {
  keywords?: string;
  location?: string;
  limit?: number;
  sources?: Array<'adzuna' | 'jooble' | 'remotive'>;
}

interface AggregationResult {
  jobs: UnifiedJob[];
  sources: {
    adzuna?: { success: boolean; count: number; error?: string };
    jooble?: { success: boolean; count: number; error?: string };
    remotive?: { success: boolean; count: number; error?: string };
  };
  deduped: number;
}

export class JobAggregatorService {
  private adzuna?: AdzunaService;
  private jooble?: JoobleService;
  private remotive: RemotiveService;
  private kv: any; // KVNamespace from Cloudflare Workers

  constructor(
    kv: any,
    adzunaApiKey?: string,
    joobleApiKey?: string
  ) {
    this.kv = kv;

    if (adzunaApiKey) {
      this.adzuna = new AdzunaService(adzunaApiKey, kv);
    }

    if (joobleApiKey) {
      this.jooble = new JoobleService(joobleApiKey, kv);
    }

    this.remotive = new RemotiveService(kv);
  }

  async search(params: AggregationParams): Promise<AggregationResult> {
    const sources = params.sources || ['adzuna', 'jooble', 'remotive'];
    const sourceTasks: Array<{
      source: 'adzuna' | 'jooble' | 'remotive';
      promise: Promise<UnifiedJob[]>;
    }> = [];

    if (sources.includes('adzuna') && this.adzuna) {
      sourceTasks.push({
        source: 'adzuna' as const,
        promise: this.adzuna.search({
          what: params.keywords,
          where: params.location,
          country: 'us',
          results_per_page: params.limit,
        }),
      });
    }

    if (sources.includes('jooble') && this.jooble) {
      sourceTasks.push({
        source: 'jooble' as const,
        promise: this.jooble.search({
          keywords: params.keywords,
          location: params.location,
          limit: params.limit,
        }),
      });
    }

    if (sources.includes('remotive')) {
      sourceTasks.push({
        source: 'remotive' as const,
        promise: this.remotive.search({
          search: params.keywords,
          limit: params.limit,
        }),
      });
    }

    // Execute all source searches concurrently
    const results = await Promise.allSettled(
      sourceTasks.map((t) => t.promise)
    );

    const jobs: UnifiedJob[] = [];
    const sourceSummary: AggregationResult['sources'] = {};

    // Process results and build summary
    results.forEach((result, idx) => {
      const source = sourceTasks[idx].source;

      if (result.status === 'fulfilled') {
        jobs.push(...result.value);
        sourceSummary[source] = {
          success: true,
          count: result.value.length,
        };
      } else {
        sourceSummary[source] = {
          success: false,
          count: 0,
          error: result.reason?.message || 'Unknown error',
        };
      }
    });

    // Filter out incomplete jobs (missing required fields)
    const incomplete = jobs.filter(job =>
      !job.title?.trim() ||
      !job.company?.trim() ||
      !job.location?.trim()
    );

    if (incomplete.length > 0) {
      console.warn(`[JobAggregator] Filtered out ${incomplete.length} incomplete jobs:`, {
        bySource: {
          adzuna: incomplete.filter(j => j.source === 'adzuna').length,
          jooble: incomplete.filter(j => j.source === 'jooble').length,
          remotive: incomplete.filter(j => j.source === 'remotive').length,
        },
        examples: incomplete.slice(0, 3).map(j => ({
          source: j.source,
          title: j.title || '[MISSING]',
          company: j.company || '[MISSING]',
          location: j.location || '[MISSING]',
        })),
      });
    }

    const complete = jobs.filter(job =>
      job.title?.trim() &&
      job.company?.trim() &&
      job.location?.trim()
    );

    // Deduplicate by job URL
    const deduped = this.deduplicateJobs(complete);

    return {
      jobs: deduped,
      sources: sourceSummary,
      deduped: jobs.length - deduped.length,
    };
  }

  private deduplicateJobs(jobs: UnifiedJob[]): UnifiedJob[] {
    const seen = new Set<string>();
    const deduped: UnifiedJob[] = [];

    for (const job of jobs) {
      // Use normalized URL as dedup key
      const key = job.jobUrl.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(job);
      }
    }

    return deduped;
  }
}

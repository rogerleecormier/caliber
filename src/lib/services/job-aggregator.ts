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
    const sourceTasks: Array<
      Promise<{
        source: 'adzuna' | 'jooble' | 'remotive';
        promise: Promise<UnifiedJob[]>;
      }>
    > = [];

    if (sources.includes('adzuna') && this.adzuna) {
      sourceTasks.push(
        Promise.resolve({
          source: 'adzuna' as const,
          promise: this.adzuna.search({
            what: params.keywords,
            where: params.location,
            country: 'us',
            results_per_page: params.limit,
          }),
        })
      );
    }

    if (sources.includes('jooble') && this.jooble) {
      sourceTasks.push(
        Promise.resolve({
          source: 'jooble' as const,
          promise: this.jooble.search({
            keywords: params.keywords,
            location: params.location,
            limit: params.limit,
          }),
        })
      );
    }

    if (sources.includes('remotive')) {
      sourceTasks.push(
        Promise.resolve({
          source: 'remotive' as const,
          promise: this.remotive.search({
            search: params.keywords,
            limit: params.limit,
          }),
        })
      );
    }

    // Execute all source searches concurrently
    const sourceResolvedTasks = await Promise.all(sourceTasks);
    const results = await Promise.allSettled(
      sourceResolvedTasks.map((t) => t.promise)
    );

    const jobs: UnifiedJob[] = [];
    const sourceSummary: AggregationResult['sources'] = {};

    // Process results and build summary
    results.forEach((result, idx) => {
      const source = sourceResolvedTasks[idx].source;

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

    // Deduplicate by job URL
    const deduped = this.deduplicateJobs(jobs);

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

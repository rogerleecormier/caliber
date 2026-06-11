import { JoobleJob, UnifiedJob } from './types';
import { getCached, setCached, hashQuery } from './cache';
import { incrementApiCall, getRateLimitStatus, canMakeJoobleRequest } from './rate-limiter';

interface JoobleSearchParams {
  keywords?: string;
  location?: string;
  limit?: number;
  enrichWithAI?: boolean; // Use Claude to analyze snippets
}

interface JoobleResponse {
  jobs: JoobleJob[];
  totalCount: number;
}

export class JoobleService {
  private apiKey: string;
  private baseUrl = 'https://jooble.org/api';
  private kv: any; // KVNamespace from Cloudflare Workers
  private cacheTtl: number;
  private claudeApiKey?: string;

  constructor(apiKey: string, kv: any, cacheTtlSeconds = 3600, claudeApiKey?: string) {
    this.apiKey = apiKey;
    this.kv = kv;
    this.cacheTtl = cacheTtlSeconds;
    this.claudeApiKey = claudeApiKey;
  }

  async search(params: JoobleSearchParams): Promise<UnifiedJob[]> {
    if (!this.apiKey) {
      throw new Error('Jooble API key not configured');
    }

    // Try cache first if KV is available
    if (this.kv) {
      const cacheKey = `jooble:${await hashQuery(params as Record<string, unknown>)}`;
      const cached = await getCached<UnifiedJob[]>(this.kv, cacheKey);
      if (cached) return cached;

      // Check rate limit before making API call
      const rateLimit = await canMakeJoobleRequest(this.kv);
      if (!rateLimit.allowed) {
        // Return empty results and log warning instead of failing completely
        console.warn(`Jooble rate limit check: ${rateLimit.reason}`);
        // Could throw here for strict mode: throw new Error(rateLimit.reason);
        return []; // Graceful degradation
      }
    }

    const bodyObj: any = {
      keywords: params.keywords || '',
      limit: Math.min(params.limit || 50, 100),
    };

    // Only add location if it's provided and not 'remote'
    if (params.location && params.location.toLowerCase() !== 'remote') {
      bodyObj.location = params.location;
    }

    const body = JSON.stringify(bodyObj);

    let response = await fetch(`${this.baseUrl}/${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    // Retry once if 403 (Jooble sometimes blocks Cloudflare IPs)
    if (response.status === 403) {
      console.warn('Jooble API returned 403, retrying once...');
      await new Promise(r => setTimeout(r, 1000));
      response = await fetch(`${this.baseUrl}/${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
    }

    // Increment counter on successful call if KV is available
    if (response.ok && this.kv) {
      await incrementApiCall(this.kv, 'jooble');

      // Check if approaching limit and log warning
      const status = await getRateLimitStatus(this.kv);
      if (status.shouldAlert) {
        console.warn(
          `⚠️ Jooble API quota approaching: ${status.currentCount}/${status.maxRequests} (${status.percentUsed}%) used`
        );
      }
    }

    if (!response.ok) {
      throw new Error(`Jooble API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JoobleResponse;
    const unified = data.jobs.map((job) => this.mapToUnified(job));

    // Cache results if KV is available
    if (this.kv) {
      const cacheKey = `jooble:${await hashQuery(params as Record<string, unknown>)}`;
      await setCached(this.kv, cacheKey, unified, this.cacheTtl);
    }

    return unified;
  }

  private mapToUnified(job: JoobleJob): UnifiedJob {
    // Parse salary from snippet if present (often in format "min-max currency")
    const salaryRange = this.parseSalaryFromSnippet(job.snippet);

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location || 'Remote',
      jobUrl: job.link,
      source: 'jooble',
      postedDate: new Date(job.updated * 1000),
      salary: salaryRange,
      description: job.snippet,
      jobType: job.type as UnifiedJob['jobType'],
      rawData: job,
    };
  }

  private parseSalaryFromSnippet(snippet: string): UnifiedJob['salary'] | undefined {
    // Try to extract salary range from snippet text
    // This is a simple pattern; enhance as needed for your use case
    const salaryMatch = snippet.match(/\$?(\d+[,\d]*)\s*-\s*\$?(\d+[,\d]*)/);
    if (salaryMatch) {
      return {
        min: parseInt(salaryMatch[1].replace(/,/g, ''), 10),
        max: parseInt(salaryMatch[2].replace(/,/g, ''), 10),
        currency: snippet.includes('€') ? 'EUR' : 'USD',
      };
    }
    return undefined;
  }

  /**
   * Enrich a job's snippet with Claude AI analysis
   * Extracts key skills, requirements, seniority level, etc.
   */
  async enrichJobWithAI(job: UnifiedJob): Promise<UnifiedJob> {
    if (!this.claudeApiKey || !job.description) {
      return job;
    }

    try {
      const prompt = `Analyze this job posting and extract key information:

Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Snippet: ${job.description}

Respond with a single line JSON object with: summary (2-3 sentences), skills (comma-separated), seniority (junior/mid/senior/executive), requirements (comma-separated)`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-20250805',
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.warn(`Claude enrichment failed for job ${job.id}: HTTP ${response.status}`);
        return job;
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
      };

      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        return job;
      }

      // Append enrichment data to rawData
      job.rawData = {
        ...((job.rawData as Record<string, unknown>) || {}),
        aiAnalysis: textContent.text,
      };

      return job;
    } catch (error) {
      console.warn(`Error enriching job ${job.id} with AI:`, error instanceof Error ? error.message : String(error));
      return job;
    }
  }
}

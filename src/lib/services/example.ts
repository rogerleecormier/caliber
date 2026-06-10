import { JobAggregatorService } from './job-aggregator';
import type { UnifiedJob } from './types';

/**
 * Example usage of the Job Aggregator Service with concurrent API calls
 *
 * This demonstrates how to:
 * 1. Initialize the aggregator with API credentials
 * 2. Search multiple sources concurrently using Promise.allSettled
 * 3. Handle partial failures gracefully
 * 4. Deduplicate results across sources
 * 5. Access rate-limited, cached results from KV
 */

export async function searchJobsExample(kv: any) {
  // Initialize aggregator with credentials from environment/secrets
  const aggregator = new JobAggregatorService(
    kv,
    process.env.ADZUNA_API_KEY, // Format: "app_id:app_key"
    process.env.PROXYCURL_API_KEY
  );

  try {
    // Search all sources concurrently
    const result = await aggregator.search({
      keywords: 'Senior Software Engineer',
      location: 'Remote, United States',
      limit: 50,
      // Optional: specify which sources to query
      sources: ['adzuna', 'proxycurl', 'remotive'],
    });

    console.log(`Found ${result.jobs.length} total jobs after deduplication`);
    console.log(`Removed ${result.deduped} duplicate entries`);

    // Check which sources succeeded
    Object.entries(result.sources).forEach(([source, status]) => {
      if (status.success) {
        console.log(`✓ ${source}: ${status.count} jobs`);
      } else {
        console.log(`✗ ${source}: ${status.error}`);
      }
    });

    // Process results — all jobs have unified interface
    result.jobs.forEach((job) => {
      console.log(`\n[${job.source}] ${job.title}`);
      console.log(`  Company: ${job.company}`);
      console.log(`  Location: ${job.location}`);
      if (job.salary) {
        console.log(
          `  Salary: ${job.salary.min ?? 'N/A'}-${job.salary.max ?? 'N/A'} ${job.salary.currency ?? 'USD'}`
        );
      }
      console.log(`  URL: ${job.jobUrl}`);
    });

    return result;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

/**
 * Rate limiting considerations:
 * - Adzuna: No explicit rate limit in free tier, but fair use applies
 * - Proxycurl: 100 requests/month on free tier, 10k/month on paid
 * - Remotive: No authentication required, fair use policy
 *
 * Caching strategy:
 * - All queries are hashed and cached in KV for 1 hour (3600s)
 * - Same query within the hour returns cached results instantly
 * - Different parameters = different cache keys
 *
 * Error handling with Promise.allSettled:
 * - One API failure doesn't block others
 * - Results object shows which sources succeeded/failed
 * - Partial results are still returned to the caller
 */

/**
 * Example: Custom filtering after aggregation
 */
export function filterByRemote(jobs: UnifiedJob[]): UnifiedJob[] {
  return jobs.filter(
    (job) => job.remote || job.location.toLowerCase().includes('remote')
  );
}

/**
 * Example: Sort by salary (highest first)
 */
export function sortBySalary(jobs: UnifiedJob[]): UnifiedJob[] {
  return jobs.sort((a, b) => {
    const aMax = a.salary?.max ?? 0;
    const bMax = b.salary?.max ?? 0;
    return bMax - aMax;
  });
}

/**
 * Example: Group by source for analytics
 */
export function groupBySource(jobs: UnifiedJob[]): Record<string, UnifiedJob[]> {
  return jobs.reduce(
    (acc, job) => {
      if (!acc[job.source]) {
        acc[job.source] = [];
      }
      acc[job.source].push(job);
      return acc;
    },
    {} as Record<string, UnifiedJob[]>
  );
}

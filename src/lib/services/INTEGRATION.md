# Integration Guide: Job Aggregator Service

This document explains how to integrate the Job Aggregator Service into your existing Caliber application.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│   React Routes (jobs, dashboard, etc.)  │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼──────┐
        │   API Route  │ (/api/jobs/search)
        └──────┬──────┘
               │
        ┌──────▼──────────────────────────┐
        │  JobAggregatorService            │
        │  (concurrent Promise.allSettled) │
        └──────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬─────────────┐
    │          │          │             │
┌───▼───┐ ┌───▼──┐ ┌────▼────┐ ┌──────▼──────┐
│Adzuna │ │Jooble│ │Remotive │ │ KV Cache    │
│ API   │ │ API  │ │ API     │ │ (1h TTL)    │
└───────┘ └──────┘ └─────────┘ └─────────────┘
```

## Step 1: Add Environment Variables

Update `.env.local` for development:
```env
ADZUNA_API_KEY=app_id:app_key
JOOBLE_API_KEY=your_jooble_api_key
```

Update `wrangler.toml` for production:
```toml
[[env.production.secrets]]
name = "ADZUNA_API_KEY"
text = "app_id:app_key"

[[env.production.secrets]]
name = "JOOBLE_API_KEY"
text = "your_jooble_api_key"
```

## Step 2: Create an API Route

Create `src/routes/api/jobs/search.ts`:

```typescript
import { json } from '@tanstack/react-start';
import { JobAggregatorService } from '@/lib/services';

export async function POST({ request, context }: any) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { keywords, location, limit, sources } = await request.json();

    const aggregator = new JobAggregatorService(
      context.KV, // Cloudflare KV binding
      context.ADZUNA_API_KEY,
      context.JOOBLE_API_KEY
    );

    const result = await aggregator.search({
      keywords,
      location,
      limit: Math.min(limit || 50, 100), // Cap at 100
      sources,
    });

    return json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Job search error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

## Step 3: Create a React Query Hook

Create `src/hooks/useJobSearch.ts`:

```typescript
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UnifiedJob } from '@/lib/services';

interface SearchParams {
  keywords?: string;
  location?: string;
  limit?: number;
  sources?: string[];
}

interface SearchResult {
  jobs: UnifiedJob[];
  sources: Record<string, { success: boolean; count: number; error?: string }>;
  deduped: number;
}

export function useJobSearch() {
  return useMutation<SearchResult, Error, SearchParams>({
    mutationFn: async (params) => {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const { data } = await response.json();
      return data;
    },
  });
}

// Or for auto-fetching on mount/params change:
export function useJobSearchQuery(params: SearchParams) {
  return useQuery({
    queryKey: ['jobs', params],
    queryFn: async () => {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) throw new Error('Search failed');
      const { data } = await response.json();
      return data as SearchResult;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

## Step 4: Use in Components

Example search component:

```typescript
import { useJobSearch } from '@/hooks/useJobSearch';
import { UnifiedJob } from '@/lib/services';
import { useState } from 'react';

export function JobSearchComponent() {
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('Remote, United States');
  const searchMutation = useJobSearch();

  const handleSearch = () => {
    searchMutation.mutate({
      keywords,
      location,
      limit: 50,
      sources: ['adzuna', 'jooble', 'remotive'],
    });
  };

  const results = searchMutation.data;

  return (
    <div className="space-y-4">
      <div>
        <input
          placeholder="Keywords (e.g., TypeScript, React)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <input
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button onClick={handleSearch} disabled={searchMutation.isPending}>
          {searchMutation.isPending ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchMutation.isError && (
        <div className="text-red-600">
          Error: {searchMutation.error?.message}
        </div>
      )}

      {results && (
        <div>
          <h3>Results: {results.jobs.length} jobs</h3>
          <p className="text-sm text-gray-600">
            Removed {results.deduped} duplicates
          </p>

          {Object.entries(results.sources).map(([source, status]) => (
            <p key={source} className="text-sm">
              {source}: {status.success ? `✓ ${status.count}` : `✗ ${status.error}`}
            </p>
          ))}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {results.jobs.map((job) => (
              <JobCard key={`${job.source}-${job.id}`} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: UnifiedJob }) {
  return (
    <a
      href={job.jobUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="border rounded-lg p-4 hover:shadow-lg transition"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold">{job.title}</h4>
          <p className="text-gray-600">{job.company}</p>
          <p className="text-sm text-gray-500">{job.location}</p>
        </div>
        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
          {job.source}
        </span>
      </div>
      {job.salary && (
        <p className="text-sm font-semibold mt-2">
          ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()} {job.salary.currency}
        </p>
      )}
      {job.postedDate && (
        <p className="text-xs text-gray-500 mt-2">
          Posted: {job.postedDate.toLocaleDateString()}
        </p>
      )}
    </a>
  );
}
```

## Step 5: Database Integration (Optional)

To store job listings in D1:

```typescript
import { jobs } from '@/db/schema'; // Your Drizzle schema
import { db } from '@/db';

async function saveJobResults(results: SearchResult) {
  const jobsToInsert = results.jobs.map(job => ({
    externalId: `${job.source}-${job.id}`,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    jobUrl: job.jobUrl,
    description: job.description,
    salaryMin: job.salary?.min,
    salaryMax: job.salary?.max,
    salaryName: job.salary?.currency,
    jobType: job.jobType,
    remote: job.remote,
    postedAt: job.postedDate,
  }));

  await db.insert(jobs)
    .values(jobsToInsert)
    .onConflictDoUpdate({
      target: jobs.externalId,
      set: { updatedAt: new Date() },
    });
}
```

## Performance Tips

1. **Caching**: The service caches queries in KV for 1 hour by default. Same query within the hour hits cache.
2. **Rate Limits**: Proxycurl has monthly limits. Monitor usage and consider pagination.
3. **Batch Operations**: For large imports, batch insert jobs into D1 with multiple queries.
4. **Filtering**: Filter results client-side to avoid redundant API calls:
   ```typescript
   const remoteOnly = results.jobs.filter(job => 
     job.remote || job.location.toLowerCase().includes('remote')
   );
   ```

## Troubleshooting

**No results from Adzuna?**
- Verify `app_id:app_key` format in `ADZUNA_API_KEY`
- Check query parameters (Adzuna requires specific format for `where` parameter)

**Jooble "unauthorized" or no results?**
- Verify API key is correct in `JOOBLE_API_KEY`
- Check that the API key is active (sign up at https://jooble.org/api)
- Jooble requires POST request with JSON body (not URL params)

**Results seem stale?**
- KV cache is 1-hour TTL. To force fresh results, modify query params.
- Clear KV: `wrangler kv:key delete <key> --binding KV`

**High latency on first search?**
- First query hits all three APIs concurrently (2-5s typical)
- Repeated queries use cache (<50ms typical)

## Next Steps

1. Add more filtering options (job type, salary range, date posted)
2. Implement saved searches with notifications
3. Add job matching logic (resume → job recommendations)
4. Create analytics dashboard (jobs by source, location, etc.)
5. Set up scheduled job discovery (daily/weekly emails)

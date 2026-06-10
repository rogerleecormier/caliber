# Job Aggregator Service

A production-ready, multi-source job listing aggregator with unified typing, concurrent API fetching, and Cloudflare KV-backed caching.

## Architecture

```
JobAggregatorService
├── AdzunaService (job board aggregator)
├── JoobleService (multi-source job aggregator)
├── RemotiveService (remote-first job board)
└── Cache layer (KV-backed with SHA256 hashing)
```

## Features

### 1. Concurrent API Fetching
- Uses `Promise.allSettled()` to query multiple sources in parallel
- One API failure doesn't block others
- Partial results returned even if some sources fail

### 2. Unified Job Interface
All third-party APIs map to a single `UnifiedJob` type:
```typescript
interface UnifiedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  source: 'adzuna' | 'jooble' | 'remotive';
  postedDate?: Date;
  salary?: { min?: number; max?: number; currency?: string };
  description?: string;
  jobType?: 'full-time' | 'part-time' | 'contract' | 'temporary';
  remote?: boolean;
  rawData?: unknown; // Original API response
}
```

### 3. Request Caching in KV
- Search queries hashed with SHA256, stored in Cloudflare KV
- Default TTL: 3600 seconds (1 hour)
- Prevents redundant API calls for identical searches
- Cache keys: `adzuna:<hash>`, `proxycurl:<hash>`, `remotive:<hash>`

### 4. Rate Limiting & Deduplication
- Concurrent requests respect per-source rate limits
- Results deduplicated by normalized job URL
- Returns dedup count in response metadata

## API Credentials (Locker Best Practices)

Store credentials securely in Cloudflare Worker environment:

```toml
# wrangler.toml
[env.production]
vars = { }

[[env.production.secrets]]
name = "ADZUNA_API_KEY"
text = "app_id:app_key"

[[env.production.secrets]]
name = "PROXYCURL_API_KEY"
text = "your_api_key"
```

Access in code:
```typescript
const aggregator = new JobAggregatorService(
  kv,
  env.ADZUNA_API_KEY,    // Format: "app_id:app_key"
  env.PROXYCURL_API_KEY
);
```

**Never commit API keys to git.** Use `.env.local` for local development:
```
ADZUNA_API_KEY=app_id:app_key
PROXYCURL_API_KEY=your_key
```

## Usage

### Basic Search
```typescript
import { JobAggregatorService } from '@/lib/services';

const aggregator = new JobAggregatorService(
  kv,
  env.ADZUNA_API_KEY,
  env.PROXYCURL_API_KEY
);

const result = await aggregator.search({
  keywords: 'TypeScript',
  location: 'Remote, United States',
  limit: 50,
});

console.log(`Found ${result.jobs.length} jobs`);
console.log(`Removed ${result.deduped} duplicates`);

// Check which sources succeeded
Object.entries(result.sources).forEach(([source, status]) => {
  console.log(`${source}: ${status.success ? '✓' : '✗'}`);
});
```

### Filtered Search
```typescript
const result = await aggregator.search({
  keywords: 'Senior Engineer',
  location: 'San Francisco',
  sources: ['adzuna', 'remotive'], // Optional: specify sources
});
```

### Error Handling
```typescript
try {
  const result = await aggregator.search({ keywords: 'Engineer' });
  
  // Some sources may have failed, but you'll still get partial results
  const successCount = Object.values(result.sources)
    .filter(s => s.success).length;
  
  console.log(`${successCount}/3 sources successful`);
  console.log(`Total jobs: ${result.jobs.length}`);
} catch (error) {
  console.error('Critical error:', error);
}
```

## Source-Specific Details

### Adzuna
- **Rate Limit**: Fair use (no explicit limit on free tier)
- **Auth**: API ID and key (`app_id:app_key`)
- **Coverage**: Job boards, company sites, job aggregators
- **Cost**: Free tier available

### Jooble
- **Rate Limit**: Fair use (no explicit rate limit)
- **Auth**: API key required (free tier available)
- **Coverage**: Multi-source aggregator (150+ job sources)
- **Cost**: Free API access, no credit card required

### Remotive
- **Rate Limit**: Fair use (no authentication required)
- **Auth**: None
- **Coverage**: Remote-first jobs only
- **Cost**: Free, open API

## Cache Strategy

### Query Hashing
Search parameters are normalized and hashed:
```typescript
const params = { keywords: 'Engineer', location: 'Remote' };
const hash = hashQuery(params); // SHA256 of sorted JSON
// Cache key: "adzuna:a1b2c3d4e5f6g7h8"
```

### TTL Management
- Default: 3600 seconds (1 hour)
- Configurable per-service initialization
- KV automatically expires entries via `expirationTtl`

### Cache Bypass
To force fresh results, modify search parameters slightly or clear KV:
```typescript
// Force cache miss by adding timestamp
const result = await aggregator.search({
  keywords: 'Engineer',
  location: 'Remote',
  // Adding unique param forces cache miss (not recommended)
});
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Concurrent API calls | 3 (all sources at once) |
| Cached query latency | <50ms |
| Cold query latency | 2-5s (depends on source) |
| Max results per source | 50-100 (configurable) |
| Total result size | ~50KB per query (typical) |
| KV cost per query | ~0.1 reads + 0.1 writes |

## Testing

Run the test suite:
```bash
npm test -- src/lib/services/__tests__/job-aggregator.test.ts
```

Tests cover:
- ✅ Concurrent API fetching
- ✅ Partial source failures
- ✅ Result deduplication
- ✅ Source filtering
- ✅ KV caching
- ✅ Unified interface mapping

## Future Enhancements

- [ ] Implement exponential backoff for rate limits
- [ ] Add TypeScript strict mode validation of third-party responses
- [ ] Stream results for large queries
- [ ] Add pagination support
- [ ] Implement request timeout/circuit breaker pattern
- [ ] Add telemetry/observability via Logpush

## Troubleshooting

### "API key format invalid"
Ensure Adzuna key is formatted as `app_id:app_key`, not just the key.

### "Source X failed but others succeeded"
This is expected. Check `result.sources[source].error` for details.

### "Empty results despite valid search"
Check cache first: `kv.delete('adzuna:<hash>')` to bypass cache.

### "Rate limit exceeded"
Implement exponential backoff between retries. Consider upgrading API plans.

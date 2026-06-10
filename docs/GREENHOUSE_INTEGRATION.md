# Greenhouse Event-Driven Job Scraping

## Overview

This document describes the event-driven Greenhouse job discovery and sync pipeline, which automatically discovers Greenhouse organizations from incoming payloads and syncs their jobs via an hourly cron task.

## Components

### 1. Database Schema: `greenhouse_orgs`

Located in `src/db/schema.ts` (migration: `drizzle/0027_greenhouse_orgs.sql`)

**Fields:**
- `id` (integer, PK, auto-increment) — Unique identifier
- `orgName` (text, unique) — Greenhouse organization slug (e.g., "github", "acme")
- `lastScrapedAt` (timestamp, nullable) — Timestamp of most recent job sync
- `status` (text, default 'active') — 'active' or 'inactive' (controls sync eligibility)
- `createdAt` (timestamp) — Organization discovery timestamp
- `updatedAt` (timestamp) — Last update timestamp

**TypeScript Types:**
```ts
export type GreenhouseOrg = typeof greenhouseOrgs.$inferSelect
export type NewGreenhouseOrg = typeof greenhouseOrgs.$inferInsert
```

### 2. URL Extractor: `greenhouse-extractor.ts`

Located in `src/lib/greenhouse-extractor.ts`

**Functions:**

#### `extractGreenhouseOrgsFromPayload(payload: string): string[]`
Extracts unique Greenhouse organization names from a payload string.

**Regex Pattern:**
```
https://([a-z0-9-]+\.)?boards\.greenhouse\.io\/([a-z0-9-]+)
```

**Examples:**
- `https://boards.greenhouse.io/acme/jobs` → `["acme"]`
- `https://example.boards.greenhouse.io/jobs` → `["example"]`
- Text with multiple links → `["acme", "github", "uber"]` (deduplicated)

#### `isGreenhouseUrl(url: string): boolean`
Check if a URL is a Greenhouse boards URL.

#### `extractOrgFromGreenhouseUrl(url: string): string | null`
Extract organization slug from a single URL.

### 3. Queue Message Type: `GreenhouseOrgMessage`

Located in `src/lib/job-ingestion-queue.ts`

**Interface:**
```ts
export interface GreenhouseOrgMessage {
  type: 'greenhouse_org_discovery'
  payload: string
}
```

**Helper Function:**
```ts
enqueueGreenhouseOrgDiscovery(
  queue: Queue<JobIngestionMessage>,
  payload: string
): Promise<void>
```

Safely enqueues a Greenhouse org discovery request. No-ops on empty payloads, logs errors without throwing.

### 4. Consumer: `greenhouse-org-consumer.ts`

Located in `src/server/queue/greenhouse-org-consumer.ts`

**Function:**
```ts
export async function processGreenhouseOrgMessage(
  db: DrizzleD1Database,
  message: GreenhouseOrgMessage,
): Promise<void>
```

**Algorithm:**
1. Extract org names from the payload string
2. For each org:
   - Query `greenhouse_orgs` table by `orgName`
   - If exists: update `updatedAt` timestamp
   - If not exists: insert new record with status='active'
3. Log results per org, catch and log errors individually

Integrated into the main `processJobIngestionBatch()` handler in `job-ingestion-consumer.ts`.

### 5. Cron Task: `greenhouse-sync.ts`

Located in `src/server/cron/greenhouse-sync.ts`

**Function:**
```ts
export async function runGreenhouseSyncCron(db: DrizzleD1Database): Promise<void>
```

**Algorithm:**

1. Query all organizations where `status = 'active'` from `greenhouse_orgs` table
2. For each organization:
   - Fetch jobs from Greenhouse Jobs API:
     ```
     GET https://boards-api.greenhouse.io/v1/boards/{org}/jobs
     ```
   - Parse JSON response: `{ jobs: GreenhouseJob[] }`
   - For each job:
     - Construct source URL: `https://boards.greenhouse.io/{org}/jobs/{jobId}`
     - Check if job exists in `jobs` table (by sourceUrl)
     - **Upsert:**
       - If exists: Update `descriptionRaw`, `descriptionPruned`, `isCleansed`, `updatedAt`
       - If not exists: Insert with default `remoteType='fully_remote'`
     - Update FTS5 index (via raw SQL, matching existing pattern)
   - Update organization's `lastScrapedAt` timestamp
3. Log completion with totals (fetched, upserted, failed)

**Triggered:** Every hour via the main worker's `scheduled` handler in `worker.ts`

**Key Details:**
- Greenhouse API endpoint is **public** (no auth required)
- Each job maps to the `jobs` table with:
  - `company` = organization slug
  - `sourceName` = 'Greenhouse'
  - `sourceUrl` = constructed URL (unique constraint)
- Description pruning and category determination use the same utilities as other job sources
- Error handling is per-org; one failure doesn't block others

### 6. Worker Integration: `worker.ts`

The main worker entry point integrates Greenhouse sync into the scheduled handler:

```ts
async scheduled(_event: ScheduledEvent, env: CloudflareEnv, _ctx: ExecutionContext) {
  const db = getDb(env.DB)
  await runLinkedinSearchMaintenance(env)
  await runGreenhouseSyncCron(db)
  if (new Date().getUTCHours() % 6 === 0) {
    await aggregateAnalytics(env)
  }
}
```

The cron is wired into the existing hourly trigger defined in `wrangler.toml`:
```json
"triggers": {"crons": ["0 * * * *"]}
```

## Usage Examples

### Discovering Greenhouse Organizations

When your application receives a payload (e.g., from a LinkedIn search, manual input, or API call) that contains Greenhouse URLs:

```ts
import { enqueueGreenhouseOrgDiscovery } from '@/lib/job-ingestion-queue'

const payload = `Check out these jobs: https://boards.greenhouse.io/acme/jobs and https://boards.greenhouse.io/github/jobs`

await enqueueGreenhouseOrgDiscovery(JOB_INGESTION_QUEUE, payload)
```

The message is queued asynchronously, extracted by the consumer, and organizations are upserted to the database within seconds.

### Querying Organizations

```ts
import { db } from '@/db/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'

// Get all active organizations
const activeOrgs = await db
  .select()
  .from(schema.greenhouseOrgs)
  .where(eq(schema.greenhouseOrgs.status, 'active'))

// Find a specific org
const org = await db
  .select()
  .from(schema.greenhouseOrgs)
  .where(eq(schema.greenhouseOrgs.orgName, 'acme'))
  .limit(1)
```

### Deactivating an Organization

To stop syncing jobs for an organization without deleting the record:

```ts
import { db } from '@/db/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'

await db
  .update(schema.greenhouseOrgs)
  .set({ status: 'inactive' })
  .where(eq(schema.greenhouseOrgs.orgName, 'acme'))
```

### Manually Triggering a Sync

For testing or immediate sync needs:

```ts
import { runGreenhouseSyncCron } from '@/server/cron/greenhouse-sync'
import { getDb } from '@/db/db'

const db = getDb(env.DB)
await runGreenhouseSyncCron(db)
```

## Data Flow

```
Incoming Payload (LinkedIn, manual, etc.)
          ↓
enqueueGreenhouseOrgDiscovery(queue, payload)
          ↓
job-ingestion-queue
          ↓
processJobIngestionBatch() [job-ingestion-consumer.ts]
          ↓
processGreenhouseOrgMessage() [greenhouse-org-consumer.ts]
          ↓
Extract org names & upsert to greenhouse_orgs table
          ↓
          
(Hourly via cron trigger)
          ↓
runGreenhouseSyncCron(db) [worker.ts scheduled handler]
          ↓
Query active orgs from greenhouse_orgs table
          ↓
For each org:
  - Fetch jobs from Greenhouse API
  - Upsert to jobs table (with sourceName='Greenhouse')
  - Update FTS5 index
  - Update lastScrapedAt
```

## Testing

### Test URL Extraction

```ts
import { extractGreenhouseOrgsFromPayload, isGreenhouseUrl } from '@/lib/greenhouse-extractor'

describe('Greenhouse Extractor', () => {
  it('extracts org names from multiple URLs', () => {
    const payload = `
      https://boards.greenhouse.io/acme/jobs
      https://boards.greenhouse.io/github/jobs
      https://example.com/careers
    `
    const orgs = extractGreenhouseOrgsFromPayload(payload)
    expect(orgs).toEqual(['acme', 'github'])
  })

  it('validates Greenhouse URLs', () => {
    expect(isGreenhouseUrl('https://boards.greenhouse.io/acme')).toBe(true)
    expect(isGreenhouseUrl('https://example.boards.greenhouse.io/jobs')).toBe(true)
    expect(isGreenhouseUrl('https://careers.greenhouse.io')).toBe(false)
  })
})
```

### Test Org Discovery

```ts
import { processGreenhouseOrgMessage } from '@/server/queue/greenhouse-org-consumer'

const message = {
  type: 'greenhouse_org_discovery' as const,
  payload: 'Check https://boards.greenhouse.io/acme/jobs',
}

await processGreenhouseOrgMessage(db, message)

const org = await db
  .select()
  .from(schema.greenhouseOrgs)
  .where(eq(schema.greenhouseOrgs.orgName, 'acme'))
  .limit(1)

expect(org[0].status).toBe('active')
```

## Monitoring

### Check Organization Sync Status

```ts
const org = await db
  .select()
  .from(schema.greenhouseOrgs)
  .where(eq(schema.greenhouseOrgs.orgName, 'acme'))
  .limit(1)

if (org.length > 0) {
  const lastSync = org[0].lastScrapedAt
  const minutesAgo = (Date.now() - lastSync.getTime()) / (1000 * 60)
  console.log(`Last sync: ${minutesAgo.toFixed(0)} minutes ago`)
}
```

### Count Jobs by Source

```ts
import { sql } from 'drizzle-orm'

const counts = await db
  .select({
    source: schema.jobs.sourceName,
    count: sql`COUNT(*)`,
  })
  .from(schema.jobs)
  .groupBy(schema.jobs.sourceName)

counts.forEach(row => console.log(`${row.source}: ${row.count}`))
```

## Troubleshooting

### No Organizations Discovered

**Symptom:** `greenhouse_orgs` table is empty after enqueuing discovery messages.

**Diagnostics:**
1. Check worker logs for `greenhouse-org-consumer` errors
2. Verify payload contains valid `boards.greenhouse.io/*` URLs
3. Confirm `enqueueGreenhouseOrgDiscovery()` is being called

**Solution:** Test the regex extractor directly on the payload:
```ts
import { extractGreenhouseOrgsFromPayload } from '@/lib/greenhouse-extractor'
const orgs = extractGreenhouseOrgsFromPayload(myPayload)
console.log(orgs) // Should return non-empty array
```

### Jobs Not Syncing

**Symptom:** `greenhouse_orgs` table has records, but `jobs` table shows no Greenhouse entries.

**Diagnostics:**
1. Check that organizations have `status='active'`
2. Verify Greenhouse API endpoint is reachable:
   ```
   curl https://boards-api.greenhouse.io/v1/boards/{org}/jobs
   ```
3. Check worker logs for `greenhouse-sync-cron` errors

**Solution:** Manually trigger sync and inspect logs:
```ts
await runGreenhouseSyncCron(db)
```

### Slow Syncs

Greenhouse API responses can be large. If sync times exceed expected duration:
1. Reduce the number of active organizations (deactivate unused ones)
2. Monitor API response times
3. Consider splitting hourly sync into multiple narrow-band cron tasks per organization

## API Reference

### Schema Types

```ts
export type GreenhouseOrg = {
  id: number
  orgName: string
  lastScrapedAt: Date | null
  status: string
  createdAt: Date
  updatedAt: Date
}
```

### Functions

| Function | Location | Returns | Purpose |
|----------|----------|---------|---------|
| `extractGreenhouseOrgsFromPayload` | `greenhouse-extractor.ts` | `string[]` | Extract org names from text |
| `isGreenhouseUrl` | `greenhouse-extractor.ts` | `boolean` | Validate Greenhouse URL |
| `extractOrgFromGreenhouseUrl` | `greenhouse-extractor.ts` | `string \| null` | Extract single org from URL |
| `enqueueGreenhouseOrgDiscovery` | `job-ingestion-queue.ts` | `Promise<void>` | Queue org discovery |
| `processGreenhouseOrgMessage` | `greenhouse-org-consumer.ts` | `Promise<void>` | Process discovery message |
| `runGreenhouseSyncCron` | `greenhouse-sync.ts` | `Promise<void>` | Run job sync for all active orgs |

## Next Steps

1. **Deploy migrations:** Run `wrangler d1 migrations apply caliber-db` to create the `greenhouse_orgs` table
2. **Test extraction:** Call `enqueueGreenhouseOrgDiscovery()` with sample payloads
3. **Monitor cron:** Watch worker logs for `greenhouse-sync-cron` entries on the next hourly trigger
4. **Integrate:** Add `enqueueGreenhouseOrgDiscovery()` calls to any API route that receives job descriptions or URLs

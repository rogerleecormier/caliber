# Caliber Job-Crawling Agent: Master Agentic Prompt

**Project:** Caliber Job Aggregation & Deduplication Platform  
**Repository:** `github.com/rogerleecormier/caliber`  
**Live:** `caliber.rcormier.dev`  
**Stack:** TanStack Start + TypeScript + Cloudflare Workers + D1 + Vectorize + AI Gateway  
**IDE Agent:** Cline / Roo Code with Gemini 2.5 Flash (BYOK)  
**Model for Comparisons:** `@cf/google/gemma-4-26b-a4b-it` (via AI Gateway)  
**Target Start Date:** [Your date]  
**Build Duration:** 5 weeks (Phase 0–5)  

---

## Executive Summary

You are building a **legally defensible, production-grade job-posting aggregator** that crawls ATS platforms (Greenhouse, Lever, Ashby, etc.) via their public JSON endpoints, deduplicates postings across sources using deterministic + embedding-based + LLM comparison, and surfaces deduplicated jobs with linked source URLs in a fast, searchable TanStack Start app.

**Your competitive advantages:**
- API-first (no HTML scraping) → legal defensibility + reliability.
- Tier-1-source focus (Greenhouse/Lever/Ashby) → clean schemas, no auth friction.
- Embedding-first dedup (Vectorize) with LLM fallback → precision with cost control.
- Your existing Cloudflare stack → zero new vendor relationships, fast iteration.

**Success criteria:**
- Crawl 50+ company boards daily, deduplicate with <2% false-positive rate.
- Sub-500ms search query latency (D1 + indexed composite keys).
- Dedup pipeline costs <$10/month on Cloudflare; LLM spend <$5/month.
- Complete first three ATS sources (Greenhouse, Lever, Ashby) by end of Phase 3.
- Deploy to production with observability (AI Gateway logs + Wrangler metrics).

---

## Part 1: Codebase Conventions & Setup

### 1.1 Repository structure (TanStack Start on Cloudflare)

```
caliber/
├── app/
│   ├── routes/
│   │   ├── api/
│   │   │   ├── crawl/
│   │   │   │   ├── __cron.ts          # Cron Trigger (hourly/daily schedule)
│   │   │   │   └── [ats].ts           # Manual trigger per ATS (dev/test)
│   │   │   ├── dedup/
│   │   │   │   ├── stage1.ts          # Deterministic/D1 exact match
│   │   │   │   ├── stage2.ts          # Fuzzy string matching (SQL)
│   │   │   │   ├── stage3.ts          # Vectorize embedding query
│   │   │   │   └── stage4.ts          # Gemma 4 LLM (gray zone only)
│   │   │   └── jobs/
│   │   │       ├── search.ts          # Search API (full-text on canonical)
│   │   │       └── [id].ts            # Single job + sources detail
│   │   └── (app)/
│   │       ├── index.tsx              # Dashboard / search UI
│   │       ├── board/[token].tsx      # Board detail (edit frequency, view stats)
│   │       └── job/[id].tsx           # Job detail with source links
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts              # D1 table definitions (Zod if typed schema layer)
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql       # canonical_jobs, job_sources, boards
│   │   │   │   ├── 002_indexes.sql
│   │   │   │   └── 003_audit_log.sql
│   │   │   └── queries.ts             # D1 wrapper queries (dedup & search)
│   │   ├── ats/
│   │   │   ├── parsers/
│   │   │   │   ├── greenhouse.ts      # Fetch + normalize Greenhouse
│   │   │   │   ├── lever.ts
│   │   │   │   ├── ashby.ts
│   │   │   │   ├── smartrecruiters.ts
│   │   │   │   ├── workable.ts
│   │   │   │   ├── recruitee.ts
│   │   │   │   └── personio.ts
│   │   │   ├── types.ts               # Shared ATS response types
│   │   │   └── discover.ts            # Board token enumeration logic
│   │   ├── dedup/
│   │   │   ├── deterministic.ts       # Stage 1: hashing / composite keys
│   │   │   ├── fuzzy.ts               # Stage 2: Jaro-Winkler / Levenshtein
│   │   │   ├── embedding.ts           # Stage 3: bge-base-en-v1.5 + Vectorize
│   │   │   └── llm.ts                 # Stage 4: Gemma 4 gray zone
│   │   ├── rate-limit/
│   │   │   ├── durable-object.ts      # Durable Object rate limiter per ATS domain
│   │   │   └── queue-handler.ts       # Queue consumer that respects rate limits
│   │   ├── normalization.ts           # Company/title/location normalization rules
│   │   └── types.ts                   # Shared TypeScript types (Job, Source, etc.)
│   ├── env.d.ts                       # Cloudflare Worker env types (Bindings)
│   └── root.tsx                       # Root layout
├── server.ts                          # Entry (TanStack Start server)
├── wrangler.toml                      # Cloudflare config (Queues, DO routes, D1, etc.)
├── tailwind.config.js
├── tsconfig.json
├── .cursorrules                       # Cursor/Cline rules (sync'd from Locker)
├── .github/
│   └── workflows/
│       ├── deploy.yml                 # Deploy on push to main
│       └── crawl-schedule.yml         # Trigger crawl cron (optional CI backup)
├── docs/
│   ├── API.md                         # Search + dedup API specs
│   ├── ATS_ENDPOINTS.md               # Current ATS endpoint reference
│   ├── ARCHITECTURE.md                # Data flow diagrams (ASCII)
│   └── DEDUP_THRESHOLDS.md            # Calibrated cosine / LLM thresholds
└── README.md
```

### 1.2 TypeScript conventions

- **Strict mode:** `strict: true` in `tsconfig.json`. No implicit `any`.
- **Import aliases:** Use `@/` for `app/`, `@server/` for `app/server/`.
- **Zod for validation:** All external API responses validated with Zod schemas before DB write.
- **Error handling:** Explicit try-catch with structured `{ error: string; code: string; statusCode: number }` responses. No silent failures.
- **Logging:** Use Cloudflare's `console` (visible in `wrangler tail`) for debug; write audit events to D1 `audit_log` table for production queries.
- **Naming:** camelCase for vars/functions; PascalCase for types/interfaces. Plural table names (`canonical_jobs`, not `canonical_job`).
- **No bare `any`.** If a type is genuinely unknown at compile time, use `unknown` + type guards.

### 1.3 Cloudflare bindings (wrangler.toml)

```toml
[env.production]
vars = { ENVIRONMENT = "production", VECTORIZE_INDEX_NAME = "job-embeddings" }
d1_databases = [ { binding = "DB", database_name = "caliber-prod", id = "..." } ]
vectorize = [ { binding = "VECTORIZE", index_name = "job-embeddings" } ]
queues.consumers = [ { queue = "crawl-jobs", max_batch_size = 100, max_batch_timeout_ms = 30000, max_retries = 3 } ]
routes = [ { pattern = "ats-*.caliber.rcormier.dev", custom_domain = true } ]  # Durable Object route (optional)
durable_objects.bindings = [ { name = "RATE_LIMITER", class_name = "RateLimiter", script_name = "caliber" } ]

[env.staging]
# Same as prod but different database + index

[env.development]
# Local D1, local Vectorize (if available), or mock responses
```

### 1.4 Environment & secrets

Store in `wrangler.toml` / `wrangler.env.{environment}`:
- `CF_AI_GATEWAY_TOKEN`: Bearer for AI Gateway (if using custom account).
- `BOARD_DISCOVERY_SEED_URL`: URL to a JSON list of `{ ats, token, company }` for bootstrap.
- `CRAWL_FREQUENCY_TIERS`: JSON config `{ "tier1": "1h", "tier2": "6h", "tier3": "24h" }`.

For sensitive discovery sources (paid aggregator keys), never check in — add to GitHub Secrets and inject via CI.

---

## Part 2: Data Models & Schema

### 2.1 D1 schema (SQL)

```sql
-- canonical_jobs: deduplicated job records
CREATE TABLE canonical_jobs (
  id TEXT PRIMARY KEY,
  company_display TEXT NOT NULL,
  company_norm TEXT NOT NULL,
  title_display TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  location_display TEXT,
  location_norm TEXT,
  remote BOOLEAN DEFAULT FALSE,
  employment_type TEXT,
  experience_level TEXT,
  department TEXT,
  team TEXT,
  description_plain TEXT,
  description_html TEXT,
  compensation_min REAL,
  compensation_max REAL,
  compensation_currency TEXT,
  is_listed BOOLEAN DEFAULT TRUE,
  dedup_key TEXT UNIQUE NOT NULL,  -- composite hash for Stage 1 lookup
  vector_id TEXT,                  -- pointer to Vectorize ID
  first_seen_at TEXT NOT NULL,     -- ISO 8601
  last_seen_at TEXT NOT NULL,
  expires_at TEXT,                 -- NULL = active; set when all sources expire
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_canonical_dedup_key ON canonical_jobs(dedup_key);
CREATE INDEX idx_canonical_company_title ON canonical_jobs(company_norm, title_norm);
CREATE INDEX idx_canonical_location ON canonical_jobs(location_norm);
CREATE INDEX idx_canonical_expires ON canonical_jobs(expires_at) WHERE expires_at IS NOT NULL;

-- job_sources: one record per (ATS, board_token, source_job_id) tuple
CREATE TABLE job_sources (
  id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL REFERENCES canonical_jobs(id),
  ats TEXT NOT NULL,                           -- greenhouse | lever | ashby | ...
  board_token TEXT NOT NULL,                   -- ATS-specific company slug
  source_job_id TEXT NOT NULL,                 -- ATS native ID
  source_url TEXT NOT NULL,                    -- hostedUrl / absolute_url
  apply_url TEXT NOT NULL,
  raw_hash TEXT NOT NULL,                      -- SHA256 of raw response (change detection)
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(ats, board_token, source_job_id),
  FOREIGN KEY(canonical_id) REFERENCES canonical_jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_sources_canonical ON job_sources(canonical_id);
CREATE INDEX idx_sources_ats_board ON job_sources(ats, board_token);
CREATE INDEX idx_sources_last_seen ON job_sources(last_seen_at);

-- boards: discovered ATS boards to crawl
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  ats TEXT NOT NULL,
  token TEXT NOT NULL,
  company_name TEXT,
  crawl_frequency_tier TEXT DEFAULT 'tier2',  -- tier1 | tier2 | tier3
  is_active BOOLEAN DEFAULT TRUE,
  last_crawled_at TEXT,
  crawl_error_count INTEGER DEFAULT 0,
  crawl_error_last_at TEXT,
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(ats, token)
);

CREATE INDEX idx_boards_active ON boards(is_active, crawl_frequency_tier);

-- audit_log: compliance + debugging
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,                    -- crawl_start | dedup_merge | vector_insert | error
  ats TEXT,
  board_token TEXT,
  canonical_id TEXT,
  source_id TEXT,
  details TEXT,                                 -- JSON
  actor TEXT DEFAULT 'system',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

### 2.2 TypeScript types

```typescript
// @server/types.ts

export interface AtsJobResponse {
  id: string;
  title: string;
  company?: string;
  location?: string | { city?: string; state?: string; country?: string; remote?: boolean };
  description?: string | { plain?: string; html?: string };
  compensation?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  absoluteUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;  // Preserve original response
}

export interface NormalizedJob {
  companyDisplay: string;
  companyNorm: string;
  titleDisplay: string;
  titleNorm: string;
  locationDisplay?: string;
  locationNorm?: string;
  remote: boolean;
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  dedupKey: string;  // Stage 1 composite hash
  rawHash: string;   // SHA256 of original JSON
}

export interface CanonicalJob {
  id: string;
  companyDisplay: string;
  companyNorm: string;
  titleDisplay: string;
  titleNorm: string;
  locationDisplay?: string;
  locationNorm?: string;
  remote: boolean;
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  dedupKey: string;
  vectorId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt?: string;
  sources: JobSource[];
}

export interface JobSource {
  id: string;
  canonicalId: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workable' | 'recruitee' | 'personio';
  boardToken: string;
  sourceJobId: string;
  sourceUrl: string;
  applyUrl: string;
  rawHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface DedupResult {
  action: 'merge_with' | 'insert_new';
  canonicalId?: string;
  stage: 1 | 2 | 3 | 4;  // Which dedup stage matched/decided
  score?: number;        // cosine (0–1) or LLM confidence
  auditEntry: AuditEvent;
}

export interface AuditEvent {
  eventType: 'crawl_start' | 'crawl_complete' | 'dedup_merge' | 'vector_insert' | 'llm_call' | 'error';
  ats?: string;
  boardToken?: string;
  canonicalId?: string;
  sourceId?: string;
  details: Record<string, unknown>;
  actor: string;
  timestamp: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
  tokensRemaining?: number;
}
```

### 2.3 Vectorize schema

Index: `job-embeddings` (one-time creation)
```bash
wrangler vectorize create job-embeddings --preset openai-3-small  # or manual config

# Config:
# name: job-embeddings
# similarity_metric: cosine
# dimensionality: 768  (for bge-base-en-v1.5)
# metadata_schema: [
#   { name: "company_norm", type: "string" },
#   { name: "canonical_id", type: "string" }
# ]
```

Vector record format:
```typescript
interface VectorRecord {
  id: string;                    // same as canonical_id
  values: number[];              // 768-dim embedding from bge-base-en-v1.5
  metadata: {
    company_norm: string;        // for filtering (same-company comparisons only)
    canonical_id: string;
  };
  // Vectorize stores by default: namespace (optional), values, metadata
}
```

---

## Part 3: Build Phases & Task Breakdown

### Phase 0: Foundations (Week 1, ~10 hours)

**Objective:** Repo scaffolding, schema, types, Cloudflare config.

**Tasks:**
1. Clone `rogerleecormier/caliber` (or init if greenfield). Confirm TanStack Start boilerplate.
2. Create D1 migrations (001_init.sql, 002_indexes.sql, 003_audit_log.sql). Deploy locally + to staging.
3. Write `@server/types.ts` with all interfaces (AtsJobResponse, NormalizedJob, CanonicalJob, JobSource).
4. Write `@server/db/schema.ts` — Zod schemas matching D1 tables for validation.
5. Write `@server/normalization.ts` — company/title/location normalization rules. (Lowercase, strip Inc/Ltd/punctuation, handle common variants like "Sr" vs "Senior".)
6. Update `wrangler.toml` with D1 binding, Vectorize binding, Queue binding, Durable Object route.
7. Add `.cursorrules` / `CLAUDE.md` from this master prompt (sync via Locker if available).
8. Write `docs/ARCHITECTURE.md` with ASCII data-flow diagram.

**Definition of done:** Schema deployed, TypeScript types pass `tsc --strict`, Wrangler config valid, README updated with dev setup.

---

### Phase 1: Single-ATS Vertical Slice (Week 1–2, ~20 hours)

**Objective:** End-to-end crawl + ingest + display for one ATS (Greenhouse), no dedup yet.

**Tasks:**
1. **Write Greenhouse parser** (`@server/ats/parsers/greenhouse.ts`):
   - Fetch `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`.
   - Validate response with Zod, extract fields, map to `AtsJobResponse`.
   - Normalize via `normalization.ts` → `NormalizedJob`.
   - Add error handling (404 = board not found, 429 = rate limit, 500 = temporary, etc.).

2. **Manual trigger endpoint** (`app/routes/api/crawl/[ats].ts`):
   - `POST /api/crawl/greenhouse?token=xyz` manually triggers a crawl (dev/test).
   - Fetches, normalizes, writes raw jobs to temp table or logs (no dedup yet).
   - Returns count + sample.

3. **Stage-1 upsert** (`@server/dedup/deterministic.ts`):
   - Compute `dedupKey = hash(company_norm + title_norm + location_norm + 7-day_window)`.
   - On insert: `canonical_jobs` UNIQUE constraint on `dedup_key` auto-dedupes exact matches within 7 days.
   - Add `job_sources` row if first occurrence; else update `last_seen_at`.

4. **Search endpoint** (`app/routes/api/jobs/search.ts`):
   - `GET /api/jobs/search?q=software+engineer&location=nyc&limit=50`.
   - Full-text search on `canonical_jobs` (title_norm, company_norm, description_plain).
   - Return paginated `CanonicalJob[]` with `sources[]` array.

5. **Search UI** (`app/routes/(app)/index.tsx`):
   - Simple form (search box, location filter) + results table.
   - Link to job detail page.

6. **Job detail page** (`app/routes/(app)/job/[id].tsx`):
   - Display canonical job + all sources as a list (company → source URL, apply URL, "Posted N days ago").
   - Link out to original source apply URLs.

7. **Cron trigger stub** (`app/routes/api/crawl/__cron.ts`):
   - On schedule: read `boards` table for active Greenhouse entries.
   - Enqueue one message per board to the crawl queue (not yet processing).
   - Return count enqueued.

**Definition of done:** Crawl Greenhouse board manually, see jobs appear in search UI + detail view. Confirm dedup_key UNIQUE prevents duplicates on repeat crawl. No LLM/vector work yet.

---

### Phase 2: Multi-ATS + Queue + Rate Limiting (Week 2–3, ~25 hours)

**Objective:** Crawl Greenhouse + Lever + Ashby in parallel via queues with per-domain rate limiting.

**Tasks:**
1. **Add Lever + Ashby parsers** (`@server/ats/parsers/lever.ts`, `ashby.ts`):
   - Same pattern as Greenhouse: fetch, validate, normalize.
   - Lever: `GET https://api.lever.co/v0/postings/{company}?mode=json`.
   - Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}`.
   - Add to `@server/ats/types.ts` — union type for all ATS responses + a router function by ATS name.

2. **Durable Object rate limiter** (`@server/rate-limit/durable-object.ts`):
   - Implement sliding-window token bucket keyed by ATS domain (e.g., `idFromName("api.greenhouse.io")`).
   - Expose `/acquire` RPC: caller provides `tokensRequested` (default 1); returns `{ allowed: boolean; retryAfterMs?: number }`.
   - Greenh ouse public job board: no published limits, default to ~50 req/sec per domain. Lever v0: no published limits, default ~50 req/sec. Ashby: no published limits, default ~50 req/sec.
   - Store state in object storage (persists across invocations).

3. **Queue producer** (modify `app/routes/api/crawl/__cron.ts`):
   - Cron fires hourly (or per `CRAWL_FREQUENCY_TIERS`).
   - Read `boards` table filtered by `is_active=true` and frequency tier (tier1=last 1h, tier2=last 6h, tier3=last 24h).
   - For each board, enqueue one message: `{ ats, token, boardId, crawlUuid }`.
   - Write `crawl_start` audit event; return count.

4. **Queue consumer** (`@server/rate-limit/queue-handler.ts`):
   - Worker consumes from `crawl-jobs` queue (batch size 100, timeout 30s).
   - For each message: call rate limiter DO for that ATS domain; wait if needed.
   - Fetch job list via the appropriate parser.
   - Normalize, compute `dedupKey`, write to D1 (Stage 1 dedup only via UNIQUE constraint).
   - Upsert `board.last_crawled_at`; log audit event.
   - On error: increment `crawl_error_count`, set `crawl_error_last_at`, re-queue with backoff.

5. **Board discovery endpoint** (`app/routes/api/crawl/discover.ts`):
   - `POST /api/crawl/discover` with `{ ats: 'greenhouse', query?: 'company name' }`.
   - Use Greenhouse's public API / Google dorks / aggregator seed list to find matching `board_token`s.
   - Upsert into `boards` table (if new, set `discovered_at` + `crawl_frequency_tier='tier2'`).
   - Return list of discovered boards.

6. **Board management UI** (`app/routes/(app)/board/[token].tsx`):
   - List all boards by ATS + tier.
   - Edit crawl frequency, toggle `is_active`, view last crawl timestamp + error count.
   - Trigger manual crawl button (enqueues immediately).

7. **Metrics / observability endpoint** (`app/routes/api/metrics.ts`):
   - `GET /api/metrics` returns:
     ```json
     {
       "canonical_jobs_count": 12345,
       "sources_count": 34567,
       "boards_active": 42,
       "last_crawl_at": "2026-06-19T15:30:00Z",
       "crawl_errors_last_24h": 2,
       "avg_dedup_merge_rate": 0.23
     }
     ```

**Definition of done:** Cron fires hourly, enqueues Greenhouse/Lever/Ashby boards, queue consumer fetches + dedupes (Stage 1) without manual intervention. Search UI shows jobs from all three ATS sources. No errors on repeat crawls (rate limiting + dedup working).

---

### Phase 3: Deterministic + Fuzzy Dedup (Week 3–4, ~20 hours)

**Objective:** Implement Stage 1 + Stage 2 dedup to catch title/company rephrasing before embeddings.

**Tasks:**
1. **Fuzzy string matching** (`@server/dedup/fuzzy.ts`):
   - Implement Jaro-Winkler distance (use `npm:string-similarity-js` or implement).
   - On Stage-1 miss: fetch all canonicals with same `company_norm` or same `location_norm`.
   - For each candidate: compute Jaro-Winkler on `title_norm` (threshold ~0.87 for "likely match").
   - Collect candidates with score > threshold; if exactly one match, treat as a merge.
   - If multiple ambiguous matches or none, escalate to Stage 3.
   - Log all fuzzy comparisons to audit table (for calibration).

2. **Deterministic hash function** (improve `@server/dedup/deterministic.ts`):
   - Current: `SHA256(company_norm + title_norm + location_norm + publish_date_window)`.
   - Edge cases: handle `undefined` location (remote jobs).
   - Ensure consistency: test that same input always yields same hash. Write unit tests.

3. **Dedup pipeline orchestration** (`@server/dedup/deterministic.ts`, updated):
   - New function `dedupPipeline(normalizedJob) → DedupResult`:
     - Stage 1: check `dedupKey` exact match in `canonical_jobs`.
     - Stage 2: run fuzzy matcher if Stage 1 misses.
     - Stage 3: (stub; will fill in Phase 4) return `{ action: 'insert_new' }` if all stages miss.
   - Write to audit log with stage + score.

4. **Increase normalization intelligence** (`@server/normalization.ts`):
   - Add company nickname handling: "Amazon Web Services" ↔ "AWS", "Amazon" (curated list).
   - Add title normalization: "Sr. SWE" → "Senior Software Engineer", "PM" → "Product Manager", etc.
   - Add location normalization: "San Francisco, CA" → "san francisco"; "Remote" → "remote"; "USA (Remote)" → "remote".
   - Unit test all normalization functions.

5. **Upsert logic** (update `queue-handler.ts`):
   - Call `dedupPipeline()` for each fetched job.
   - If `action === 'merge_with'`: insert into `job_sources` pointing at existing `canonical_id`.
   - If `action === 'insert_new'`: generate new `canonical_id` (ULID), write `canonical_jobs` + `job_sources`.
   - Update `last_seen_at` on the canonical (even on merge).
   - Write audit event with dedup stage + score.

6. **Test with sample data:**
   - Crawl Greenhouse + Lever boards for same company.
   - Confirm same role posted at multiple sources dedupes correctly (fuzzy catch "Senior Engineer" vs "Sr. Engineer").
   - Hand-verify 20 merges for false-positive rate. Target: <2% false merges.

**Definition of done:** Dedup pipeline completes Stage 1 + Stage 2. Fuzzy matching catches title/company rephrasings. <2% false-positive rate on labeled sample. Queue consumer handles dedup transparently; no manual intervention needed.

---

### Phase 4: Embedding + Vectorize (Week 4, ~18 hours)

**Objective:** Layer embedding-based dedup (Vectorize) for semantic matching, reserve LLM for gray zone only.

**Tasks:**
1. **Embedding generation** (`@server/dedup/embedding.ts`):
   - New function `embedJob(normalizedJob) → Promise<{ vector: number[]; text: string }>`:
     - Compose embedding text: `${title_norm} ${company_norm} ${location_norm} ${description_plain.substring(0, 500)}`.
     - Call `env.AI.run('@cf/baai/bge-base-en-v1.5', { text: embeddingText })`.
     - Return 768-dim vector.
   - Add error handling: embedding failures fallback to Stage 4 (LLM) or skip vector insert.

2. **Vectorize integration** (`@server/dedup/embedding.ts`, continued):
   - On every canonical insert/update, generate embedding.
   - Upsert to `env.VECTORIZE`:
     ```typescript
     await env.VECTORIZE.upsert([
       {
         id: canonicalId,
         values: vector,
         metadata: { company_norm: normalizedJob.companyNorm, canonical_id: canonicalId }
       }
     ]);
     ```
   - Query Vectorize on dedup misses (Stage 3):
     ```typescript
     const results = await env.VECTORIZE.query(vector, {
       returnMetadata: 'all',
       returnValues: true,
       topK: 10,
       whereMetadata: { company_norm: normalizedJob.companyNorm }  // same-company filter
     });
     ```

3. **Stage-3 query logic** (new function in `dedup/embedding.ts`):
   - Given `normalizedJob`, embed it.
   - Query Vectorize, filter by `company_norm` (metadata).
   - For each result: compute cosine similarity (vectors already in results).
   - Classify:
     - cosine ≥ 0.92 (high threshold): auto-merge, no LLM.
     - 0.82 ≤ cosine < 0.92 (gray zone): escalate to Stage 4.
     - cosine < 0.82: treat as distinct, insert new canonical.
   - Thresholds are calibrated on a labeled sample in Phase 4 final step.

4. **Create labeled sample dataset:**
   - Manually hand-label 100 pairs of job postings as `same` or `different`.
   - Include: exact duplicates, same role reworded, similar title but diff location, different roles at same company.
   - Run embedding + cosine on all pairs; plot distribution.
   - Calibrate thresholds to minimize false merges (precision ≥ 0.98) with acceptable recall.

5. **Add LLM gray-zone threshold config** (`wrangler.toml`):
   ```toml
   [env.production]
   vars = {
     VECTORIZE_INDEX_NAME = "job-embeddings",
     COSINE_AUTO_MERGE_THRESHOLD = "0.92",
     COSINE_GRAY_ZONE_LOW = "0.82",
     COSINE_GRAY_ZONE_HIGH = "0.92"
   }
   ```

6. **Vectorize index creation & test:**
   - `wrangler vectorize create job-embeddings --preset openai-3-small` (or manual config for cosine, 768-dim).
   - Deploy to staging.
   - Crawl 500 jobs, confirm all embeddings generate + insert into Vectorize.
   - Test cosine queries; confirm filtering by `company_norm` works.

7. **Audit logging for vectors:**
   - Log vector insert/query to audit table: `{ eventType: 'vector_insert', canonicalId, cosine_score?, stage: 3 }`.
   - Track embedding failures separately.

**Definition of done:** Embeddings generate on canonical insert. Vectorize queries return top-10 same-company matches with cosine. Gray-zone pairs log for Phase 4 final work (LLM). Hand-labeled sample validates cosine thresholds. <2% false merge rate maintained.

---

### Phase 5: LLM Gray Zone + AI Gateway (Week 5, ~15 hours)

**Objective:** Route ambiguous dedup pairs to Gemma 4 26B via AI Gateway; finalize + deploy to production.

**Tasks:**
1. **LLM comparison logic** (`@server/dedup/llm.ts`):
   - New function `compareJobsWithLLM(job1: NormalizedJob, job2: NormalizedJob) → Promise<{ same: boolean; confidence: number }>`:
     - Compose prompt:
       ```
       Are these two job postings for the same role at the same company?
       
       Job 1:
       - Company: {job1.companyDisplay}
       - Title: {job1.titleDisplay}
       - Location: {job1.locationDisplay}
       - Description (first 200 chars): {job1.descriptionPlain?.substring(0, 200)}
       
       Job 2:
       - Company: {job2.companyDisplay}
       - Title: {job2.titleDisplay}
       - Location: {job2.locationDisplay}
       - Description (first 200 chars): {job2.descriptionPlain?.substring(0, 200)}
       
       Respond ONLY with JSON: { "same_role": boolean, "confidence": 0.0-1.0 }
       ```
     - Call Gemma 4 26B via AI Gateway:
       ```typescript
       const response = await fetch('https://gateway.ai.cloudflare.com/v1/...', {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${env.CF_AI_GATEWAY_TOKEN}` },
         body: JSON.stringify({
           model: '@cf/google/gemma-4-26b-a4b-it',
           messages: [{ role: 'user', content: prompt }],
           max_tokens: 100,
           temperature: 0.2  // Low temp for deterministic yes/no
         })
       });
       ```
     - Parse JSON from response; return `{ same: boolean, confidence: number }`.
     - Log to audit table: `{ eventType: 'llm_call', stage: 4, confidence, latency_ms }`.

2. **AI Gateway setup:**
   - Cloudflare AI Gateway is free on all plans; no separate provisioning needed.
   - Configure caching on gateway:
     - Cache successful LLM responses by (company_norm, title_norm) composite key.
     - 24h TTL for cached dedup decisions.
   - Enable observability:
     - AI Gateway logs all requests; view in Cloudflare dashboard.
     - Export logs to your monitoring if needed (Log Push with Logpush).

3. **Stage-4 integration** (update `queue-handler.ts`):
   - On gray-zone pair (0.82 ≤ cosine < 0.92):
     - Call `compareJobsWithLLM(newJob, candidateCanonical)`.
     - If `same_role` && confidence > 0.75: merge.
     - Otherwise: insert new canonical.
     - Log decision + confidence.

4. **Cost monitoring:**
   - Gemma 4 26B costs ~$0.011 per 1,000 neurons (per Cloudflare docs).
   - Estimate: ~50 gray-zone comparisons per crawl cycle × 2 neurons per call ≈ 100 neurons ≈ $0.001 per cycle.
   - Target: <$5/month (500k neurons).
   - Add a `/api/metrics` cost field: `{ llm_calls_last_24h, estimated_cost_this_month }`.

5. **Error handling:**
   - If LLM call fails (timeout, 500, rate limit): fallback to "insert new" (conservative; no false merge).
   - Log error + retry logic: queue retry with backoff.

6. **Validation on staging:**
   - Deploy to staging.
   - Run crawl cycle; confirm gray-zone pairs route to LLM.
   - Hand-verify 20 LLM decisions for correctness.
   - Check AI Gateway logs for latency + token count.
   - Confirm caching works (repeated comparisons hit cache).

7. **Production deployment:**
   - Tag release `v1.0.0-mvp`.
   - Deploy to production: `wrangler deploy --env production`.
   - Monitor: audit logs, metrics, error rates.
   - Alert thresholds: crawl error rate > 5%, LLM latency > 5s, dedup merge rate > 40%.

8. **Documentation:**
   - Update `docs/ARCHITECTURE.md` with final data flow.
   - Add `docs/DEDUP_THRESHOLDS.md`: cosine thresholds, LLM confidence, hand-labeled sample results.
   - Add `docs/API.md`: search endpoint spec, metrics endpoint, board discovery endpoint.
   - Add `DEPLOYMENT.md`: how to deploy, scale to new ATS, monitor costs.

**Definition of done:** LLM dedup working. <2% false-merge rate end-to-end. Cost tracking in place. Deployed to production. Observability: AI Gateway logs + Wrangler metrics visible. Documentation complete.

---

## Part 4: Implementation Guidance for Agentic IDE

### 4.1 Cline / Roo Code workflow

1. **Load this master prompt into your IDE agent:**
   - Paste full text into "system instructions" or `.cursorrules` / `CLAUDE.md`.
   - Reference from your prompt: `Build Phase X from the Caliber Job Crawler master prompt.`

2. **Per-phase task execution:**
   - Agent reads task list for phase.
   - Agent analyzes existing codebase (imports existing files, understands patterns).
   - Agent writes files in order (dependencies first: types → DB → API endpoints → UI).
   - Agent runs `tsc --strict` to validate TypeScript.
   - Agent commits to git: `git commit -m "Phase X: [task summary]"`.

3. **Testing instructions for agent:**
   - Unit tests: write `.test.ts` files for pure functions (normalization, hashing, fuzzy matching).
   - Integration tests: fetch real Greenhouse board, store in D1, verify in UI.
   - Use `wrangler dev` for local testing; agent can start/stop server.
   - On Phase N completion, agent runs test suite and reports coverage.

4. **Error recovery:**
   - If `tsc` fails: agent reads error, fixes type issues.
   - If Wrangler deploy fails: agent checks `wrangler.toml`, fixes config.
   - If a DB query fails: agent views schema, adjusts query.
   - If API endpoint 404s: agent checks routing (TanStack Start routes must match file structure).

5. **Code review checklist (agent should self-review):**
   - All TypeScript passes `tsc --strict --noImplicitAny`.
   - All error paths logged (no silent failures).
   - No bare `any` types.
   - All external API responses validated with Zod.
   - D1 queries parameterized (no SQL injection).
   - Audit logging on all state changes.
   - Comments on non-obvious logic.

### 4.2 Token budgeting & breakpoints

For Gemini 2.5 Flash BYOK (high efficiency):

- **Phase 0:** ~8k tokens to scaffold, ~4k to validate schema. Breakpoint: after schema deployed, before parsers.
- **Phase 1:** ~15k for Greenhouse parser + search API. Breakpoint: after manual crawl works.
- **Phase 2:** ~20k for Lever/Ashby + queue + rate limiter. Breakpoint: after queue consumer processes without errors.
- **Phase 3:** ~15k for fuzzy matching + audit logging. Breakpoint: after hand-labeled sample validates thresholds.
- **Phase 4:** ~12k for Vectorize integration. Breakpoint: after embeddings generate + cosine queries work.
- **Phase 5:** ~10k for LLM + deployment. Breakpoint: after production deploy + metrics visible.

**Total:** ~80k tokens over 5 weeks (assumes iterative development, one phase per session, cleanup of hallucinations).

### 4.3 File creation order (agent dependency graph)

```
1. types.ts (@server/types.ts)
   ↓
2. schema.ts (@server/db/schema.ts) — depends on types
   ↓
3. D1 migrations (db/migrations/*.sql)
   ↓
4. normalization.ts (@server/normalization.ts) — pure functions
   ↓
5. deterministic.ts (@server/dedup/deterministic.ts) — depends on types + normalization
   ↓
6. greenhouse.ts parser (@server/ats/parsers/greenhouse.ts) — depends on types, calls normalization
   ↓
7. queue-handler.ts (@server/rate-limit/queue-handler.ts) — depends on parser + deterministic
   ↓
8. API routes (app/routes/api/*.ts) — wire together above
   ↓
9. UI routes (app/routes/(app)/*.tsx) — depend on API routes
   ↓
10. (Phases 2–5: expand parsers, add Vectorize, LLM, etc.)
```

### 4.4 Prompt structure for agent per phase

Example for Phase 2:

> **Task: Implement multi-ATS crawling with Cloudflare Queues & Durable Objects rate limiting.**
> 
> **Context:**
> - Greenhouse crawler + search UI working from Phase 1.
> - Schema ready; D1 accessible via env.DB.
> 
> **Acceptance criteria:**
> - Lever + Ashby parsers normalize jobs, store to D1.
> - Cron trigger enqueues 1 message per board to `crawl-jobs` queue.
> - Queue consumer (Durable Object rate limiter) fetches + dedupes (Stage 1 only), writes to D1.
> - No manual intervention; crawl runs hourly without errors.
> - Board management UI: toggle active, view last crawl + error count.
> 
> **Implementation steps:**
> 1. Add `lever.ts` and `ashby.ts` parsers; test with `npm run dev` + manual POST to `/api/crawl/lever?token=xxx`.
> 2. Write Durable Object rate limiter; test `/acquire` RPC locally.
> 3. Implement queue consumer; test with `wrangler queues consume`.
> 4. Modify cron route to enqueue (dry-run first).
> 5. Add board management page; verify UI reads + displays boards.
> 6. Hand-test one crawl cycle; confirm dedup + sources linked.
> 
> **Deliverables:**
> - `@server/ats/parsers/{lever,ashby}.ts`
> - `@server/rate-limit/durable-object.ts`
> - `@server/rate-limit/queue-handler.ts` (updated)
> - `app/routes/api/crawl/__cron.ts` (updated to enqueue)
> - `app/routes/(app)/board/[token].tsx` (new)
> - All tests pass; no TypeScript errors; git commits.

---

## Part 5: Observability & Monitoring

### 5.1 Audit logging (D1 table)

Every dedup decision, crawl, error goes to `audit_log`:

```typescript
async function logAudit(
  env: Env,
  event: AuditEvent
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_log (id, event_type, ats, board_token, canonical_id, source_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    event.eventType,
    event.ats ?? null,
    event.boardToken ?? null,
    event.canonicalId ?? null,
    event.sourceId ?? null,
    JSON.stringify(event.details),
    new Date().toISOString()
  ).run();
}
```

Query audit logs:
- Dedup merges: `SELECT COUNT(*) FROM audit_log WHERE event_type='dedup_merge'`.
- Error rate: `SELECT COUNT(*) FROM audit_log WHERE event_type='error'`.
- LLM calls: `SELECT AVG(CAST(details->>'latency_ms' AS REAL)) FROM audit_log WHERE event_type='llm_call' AND created_at > datetime('now', '-24 hours')`.

### 5.2 Metrics endpoint

```typescript
// app/routes/api/metrics.ts
export async function GET({ context }: RequestEvent) {
  const env = context.cloudflare.env as Env;

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM canonical_jobs) as canonical_count,
      (SELECT COUNT(*) FROM job_sources) as source_count,
      (SELECT COUNT(*) FROM boards WHERE is_active=1) as active_boards,
      (SELECT MAX(last_crawled_at) FROM boards) as last_crawl_at,
      (SELECT COUNT(*) FROM audit_log WHERE event_type='error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
      (SELECT COUNT(*) FROM audit_log WHERE event_type='llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h
  `).first() as Record<string, unknown>;

  const estimatedCost = (stats.llm_calls_24h as number * 2 * 0.011 / 1000).toFixed(2);

  return json({
    canonical_jobs: stats.canonical_count,
    sources: stats.source_count,
    boards_active: stats.active_boards,
    last_crawl_at: stats.last_crawl_at,
    errors_last_24h: stats.errors_24h,
    llm_calls_last_24h: stats.llm_calls_24h,
    estimated_cost_this_month: `$${estimatedCost}`,
    timestamp: new Date().toISOString()
  });
}
```

Embed in dashboard or expose publicly (no auth, public metrics).

### 5.3 AI Gateway observability

AI Gateway logs all requests automatically. Access in Cloudflare dashboard:
- **Analytics:** Requests by model, token counts, latency distribution.
- **Caching:** Hit rate, cache key breakdown.
- **Cost:** Per-model token usage × pricing.

Configure Logpush to export to your log aggregator (optional, paid).

### 5.4 Wrangler tail for dev

```bash
wrangler tail --env production
# Streams live logs (console.log, errors, audit events) from production Workers.
```

---

## Part 6: Legal & Deployment Checklist

### 6.1 Pre-deployment compliance review

- [ ] All crawled data is from **public, unauthenticated** ATS endpoints (no login required).
- [ ] No clickwrap ToS acceptance in crawl flow.
- [ ] User-Agent header set to honest bot identifier: `Caliber-Bot/1.0 (+https://caliber.rcormier.dev; contact@rcormier.dev)`.
- [ ] robots.txt honored: `Crawl-Delay` and `Disallow` rules respected.
- [ ] 429 / 503 responses trigger exponential backoff; never hammer a failing endpoint.
- [ ] Job posting data only — no applicant/personal PII scraped or stored.
- [ ] Original `sourceUrl` always linked; never re-host the apply form.
- [ ] Audit trail: every crawl + dedup decision logged with timestamp + source URL.

### 6.2 Deployment steps

1. **Staging validation:**
   ```bash
   wrangler deploy --env staging
   # Test crawl Greenhouse + Lever + Ashby; confirm dedup works.
   # Monitor AI Gateway logs for LLM calls.
   # Check D1 query performance (search should be <500ms).
   ```

2. **Production deployment:**
   ```bash
   git tag v1.0.0-mvp
   wrangler deploy --env production
   ```

3. **Post-deploy verification:**
   - Monitor `GET /api/metrics` for 24h; confirm crawl runs, dedup works, no errors.
   - Check AI Gateway dashboard: confirm caching hit rate > 70%.
   - Spot-check audit logs: sample 10 merges, verify correctness.

4. **On-call runbook:**
   - **High crawl error rate:** check rate-limit DO state; may have hit soft limit; restart if stuck.
   - **LLM latency spike:** check AI Gateway logs; may be model overload; fall back to "insert new" (conservative).
   - **False merges:** check cosine thresholds; lower high threshold by 0.02; re-deploy.

### 6.3 Scaling for additional ATS platforms

To add a new ATS (e.g., SmartRecruiters):

1. Write parser: `@server/ats/parsers/smartrecruiters.ts` (similar to Greenhouse).
2. Add to ATS union type: `type AtsName = 'greenhouse' | 'lever' | ... | 'smartrecruiters'`.
3. Add router logic: `getParser(atsName)` returns appropriate function.
4. Update discovery: seed new board tokens via `POST /api/crawl/discover?ats=smartrecruiters`.
5. Test crawl cycle (manual); confirm dedup works cross-ATS.
6. Deploy.

---

## Part 7: Code Templates & Snippets

### 7.1 Generic ATS parser template

```typescript
// @server/ats/parsers/example.ts
import { z } from 'zod';
import { AtsJobResponse, NormalizedJob } from '@server/types';
import { normalizeJob } from '@server/normalization';

const ExampleJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  url: z.string(),
  applyUrl: z.string(),
});

type ExampleJob = z.infer<typeof ExampleJobSchema>;

export async function fetchExampleJobs(
  boardToken: string
): Promise<AtsJobResponse[]> {
  const url = `https://api.example.com/jobs/${boardToken}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Example API error: ${response.status}`);
  }

  const data = await response.json();
  const jobs = z.array(ExampleJobSchema).parse(data.jobs);

  return jobs.map((job: ExampleJob) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    absoluteUrl: job.url,
    applyUrl: job.applyUrl,
    raw: job,
  }));
}

export async function normalizeExampleJob(
  job: AtsJobResponse
): Promise<NormalizedJob> {
  return normalizeJob({
    companyDisplay: job.company ?? 'Unknown',
    titleDisplay: job.title,
    locationDisplay: job.location,
    descriptionPlain: job.description,
  });
}
```

### 7.2 D1 query wrapper

```typescript
// @server/db/queries.ts
import { CanonicalJob, JobSource } from '@server/types';

export async function findOrCreateCanonical(
  env: Env,
  dedupKey: string,
  normalized: NormalizedJob
): Promise<{ id: string; isNew: boolean }> {
  // Try to find existing
  const existing = await env.DB.prepare(
    'SELECT id FROM canonical_jobs WHERE dedup_key = ?'
  ).bind(dedupKey).first<{ id: string }>();

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Insert new
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO canonical_jobs (
      id, company_display, company_norm, title_display, title_norm,
      location_display, location_norm, remote, description_plain, dedup_key,
      first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    normalized.companyDisplay,
    normalized.companyNorm,
    normalized.titleDisplay,
    normalized.titleNorm,
    normalized.locationDisplay ?? null,
    normalized.locationNorm ?? null,
    normalized.remote ? 1 : 0,
    normalized.descriptionPlain ?? null,
    dedupKey,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return { id, isNew: true };
}

export async function linkJobSource(
  env: Env,
  canonicalId: string,
  source: {
    ats: string;
    boardToken: string;
    sourceJobId: string;
    sourceUrl: string;
    applyUrl: string;
    rawHash: string;
  }
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO job_sources (
      id, canonical_id, ats, board_token, source_job_id, source_url, apply_url,
      raw_hash, first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ats, board_token, source_job_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
  `).bind(
    id,
    canonicalId,
    source.ats,
    source.boardToken,
    source.sourceJobId,
    source.sourceUrl,
    source.applyUrl,
    source.rawHash,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
}
```

### 7.3 Rate limiter Durable Object

```typescript
// @server/rate-limit/durable-object.ts
import { DurableObject } from 'cloudflare:workers';

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

export class RateLimiter extends DurableObject {
  private bucket: TokenBucket = { tokens: 50, lastRefillAt: Date.now() };
  private capacity = 50;
  private refillRatePerSecond = 50 / 10;  // 50 tokens per 10 seconds

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/acquire') {
      const tokensRequested = parseInt(url.searchParams.get('tokens') ?? '1', 10);
      return this.handleAcquire(tokensRequested);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleAcquire(tokensRequested: number): Response {
    this.refillBucket();

    if (this.bucket.tokens >= tokensRequested) {
      this.bucket.tokens -= tokensRequested;
      return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    }

    const tokensNeeded = tokensRequested - this.bucket.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.refillRatePerSecond) * 1000);

    return new Response(
      JSON.stringify({ allowed: false, retryAfterMs }),
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfterMs / 1000).toString() } }
    );
  }

  private refillBucket(): void {
    const now = Date.now();
    const secondsElapsed = (now - this.bucket.lastRefillAt) / 1000;
    const tokensToAdd = secondsElapsed * this.refillRatePerSecond;

    this.bucket.tokens = Math.min(this.capacity, this.bucket.tokens + tokensToAdd);
    this.bucket.lastRefillAt = now;
  }
}
```

---

## Final Notes

This master prompt is **living documentation.** As you build:

1. **Update this file** when you discover ATS-specific quirks, thresholds that work, or edge cases.
2. **Commit updates** to `docs/MASTER_PROMPT.md` in your repo.
3. **Link from issue tracker:** reference this master prompt in GitHub issues / Asana / your project tool.
4. **Share with agent:** at the start of each session, feed this prompt + recent updates to your IDE agent.

**Success is iterative.** Phase N may reveal feedback that changes Phase N+1. Be ruthless about abandoning assumptions.

**On scope creep:** The 5-phase plan is MVP. Post-MVP features (Workday HTML scraping, iCIMS, advanced search filters, email alerts, UI polish) are out of scope for this master prompt. Tackle them only after Phase 5 deploys clean.

---

**Next step:** Copy this master prompt into `.cursorrules` or `docs/MASTER_PROMPT.md`. Feed it to your IDE agent (Cline/Roo Code) and begin Phase 0.

Good luck.

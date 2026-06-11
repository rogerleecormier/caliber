# Getting Full Job Descriptions from Jooble via API

## Problem
The Jooble API returns job **snippets** (short excerpts), not full descriptions. Full descriptions require either:
1. Scraping individual job pages (bot detection risk)
2. Using an API-based enrichment service
3. Using AI analysis on available data

## Solution Approaches

### Option 1: Claude AI Enrichment (Recommended ✅)
**What it does:** Uses Claude API to analyze job snippets and extract structured information.

**Pros:**
- ✅ No web scraping or bot detection issues
- ✅ Works offline — no page loading needed
- ✅ Structured analysis (skills, seniority, requirements)
- ✅ Fast and reliable
- ✅ Integrated into existing JoobleService

**Cons:**
- ❌ Costs Claude API tokens per job
- ❌ Analysis based on snippet, not full description

**Implementation:**
```typescript
const joobleService = new JoobleService(apiKey, kv, 3600, claudeApiKey);
const jobs = await joobleService.search({ keywords: 'Engineer', location: 'Remote' });

// Enrich a specific job
const enriched = await joobleService.enrichJobWithAI(jobs[0]);
console.log(enriched.rawData.aiAnalysis);
```

**Cost estimate:** ~0.01-0.05 tokens per job (Claude Opus at ~$3/1M tokens)

---

### Option 2: Third-Party Enrichment API
**What it does:** Use a dedicated service to extract content from job pages via their API.

**Services:**
- **Diffbot** — Professional content extraction, handles JavaScript
- **Apify** — Headless browser automation with IP rotation
- **ScrapingBee** — Proxy rotation + JavaScript rendering
- **Bright Data** — Residential IPs + managed proxy network

**Pros:**
- ✅ Full description extraction from any page
- ✅ Handles JavaScript rendering
- ✅ Bot detection bypass built-in
- ✅ IP rotation (Bright Data)

**Cons:**
- ❌ Additional API costs
- ❌ Setup complexity
- ❌ Requires API key management
- ❌ Slower (multiple HTTP requests)

**Example with ScrapingBee:**
```typescript
async function fetchFullDescription(jobUrl: string, beapiKey: string): Promise<string> {
  const response = await fetch('https://api.scrapingbee.com/api/v1', {
    method: 'GET',
    headers: {
      'api-key': beapiKey,
    },
  });
  const data = await response.json();
  // Extract description from data.html
  return extractDescription(data.html);
}
```

**Cost estimate:** $0.01-0.05 per request depending on service

---

### Option 3: Switch to Alternative Job API
**What it does:** Use a different job board API that provides full descriptions.

**Services:**
- **Remotive API** ✅ Already integrated — returns full descriptions
- **Indeed API** — Full descriptions included, rate limits apply
- **JoinAround** — Full descriptions in API response
- **Workable API** — Full descriptions available

**Pros:**
- ✅ No scraping needed
- ✅ Official API (no TOS violations)
- ✅ Reliable and documented

**Cons:**
- ❌ Different job sources (not all jobs in Jooble)
- ❌ May require separate API keys
- ❌ Coverage depends on provider

**Recommendation:** Remotive is already in your codebase and provides full descriptions directly.

---

### Option 4: Headless Browser Scraping (Advanced)
**What it does:** Use Puppeteer or Playwright in a Cloudflare Worker to load pages.

**Pros:**
- ✅ Full description extraction
- ✅ JavaScript rendering support

**Cons:**
- ❌ Very high risk of bot detection
- ❌ Heavy resource usage (not practical on Workers)
- ❌ Cloudflare Workers don't support long-running browsers
- ❌ High latency

**Not recommended** for this use case.

---

## Implementation: Claude Enrichment

### Step 1: Add Claude API Key
```bash
# .env.local
CLAUDE_API_KEY=sk-ant-...
```

### Step 2: Initialize Service with Claude Key
```typescript
import { JoobleService } from './services/jooble';

const joobleService = new JoobleService(
  process.env.JOOBLE_API_KEY,
  kv,
  3600,
  process.env.CLAUDE_API_KEY // New parameter
);
```

### Step 3: Search and Enrich
```typescript
const results = await joobleService.search({
  keywords: 'Software Engineer',
  location: 'Remote',
  enrichWithAI: true,
});

for (const job of results) {
  const enriched = await joobleService.enrichJobWithAI(job);
  
  // Access AI analysis
  const analysis = enriched.rawData?.aiAnalysis;
  console.log('Skills:', analysis); // Parsed from Claude response
}
```

### Step 4: Batch Enrichment (for multiple jobs)
```typescript
async function enrichMultipleJobs(jobs: UnifiedJob[], delay = 500) {
  for (const job of jobs) {
    await joobleService.enrichJobWithAI(job);
    await new Promise(r => setTimeout(r, delay)); // Rate limiting
  }
}
```

---

## Comparison Table

| Approach | Cost | Speed | Coverage | Setup | Bot Detection |
|----------|------|-------|----------|-------|---------------|
| Claude Enrichment | Low | Fast | Jooble + analysis | Easy | ✅ None |
| Diffbot | Medium | Medium | Full | Medium | ✅ Handled |
| Apify | Medium | Slow | Full | Hard | ✅ Handled |
| ScrapingBee | Low-Med | Medium | Full | Easy | ✅ Handled |
| Bright Data | High | Medium | Full | Hard | ✅ Residential IPs |
| Remotive API | Free | Fast | Limited | Easy | ✅ None |
| Indeed API | Free | Fast | Broad | Medium | ✅ None |
| Headless Browser | High | Slow | Full | Hard | ❌ Risky |

---

## Recommendation

**Use Claude Enrichment (Option 1)** because:
1. ✅ No bot detection risk
2. ✅ Already integrated into JoobleService
3. ✅ Works with existing Jooble API key
4. ✅ Minimal additional setup
5. ✅ Structured analysis output
6. ✅ Reasonable cost (~$0.01-0.05 per job)

For better coverage, **combine with Remotive API** which already provides full descriptions:
- Use both APIs in job-aggregator.ts
- Remotive for full descriptions
- Jooble + Claude for snippet analysis when needed

---

## Environment Variables

```bash
# Required
JOOBLE_API_KEY=04fca09b-40fe-4c47-b657-7112d915b166

# Optional for enrichment
CLAUDE_API_KEY=sk-ant-...

# Optional for third-party services
DIFFBOT_API_KEY=...
SCRAPINGBEE_API_KEY=...
BRIGHT_DATA_API_KEY=...
```

---

## Testing

```bash
# Test Jooble API only
npm test -- jooble.test.ts

# Test Claude enrichment
CLAUDE_API_KEY=sk-ant-... npm test -- jooble-enrichment.test.ts

# Manual test
npm run dev
# POST /api/jobs/search { keywords: "Engineer", enrichWithAI: true }
```

---

## Rate Limiting

**Jooble API:**
- Free tier: 500 requests/month
- Fair use: ~16 requests/day

**Claude API (if enriching):**
- No hard limit for most users
- Token-based pricing: ~$3/1M input tokens, ~$15/1M output tokens
- Cost per job: ~$0.0001-0.0005

**Recommendation:** Cache results aggressively and enrich selectively (only recent/high-priority jobs).

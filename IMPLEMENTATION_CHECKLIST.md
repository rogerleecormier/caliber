# Job Aggregator Service — Implementation Checklist

Use this checklist to integrate the service into your application.

## ✅ Completed by Claude Code

### Service Core
- [x] Unified job types (UnifiedJob interface)
- [x] Cache layer (KV + SHA256 hashing)
- [x] Adzuna service integration
- [x] Jooble service integration (replaced Proxycurl)
- [x] Remotive service integration
- [x] Job aggregator orchestrator
- [x] Promise.allSettled() concurrent fetching
- [x] Full test suite (Vitest)

### Documentation
- [x] README.md (architecture + usage)
- [x] INTEGRATION.md (step-by-step guide)
- [x] JOOBLE_MIGRATION.md (Proxycurl → Jooble)
- [x] SERVICES_DELIVERY.md (high-level summary)
- [x] Code examples (example.ts)
- [x] Inline comments + docstrings

### API Credentials
- [x] Jooble API key obtained: `04fca09b-40fe-4c47-b657-7112d915b166`
- [x] Credential management pattern documented
- [x] .env.example updated
- [x] Memory updated with API key reference

## 📋 Your Checklist (Next Steps)

### Phase 1: Setup (Today)

#### 1.1 Environment Configuration
- [ ] Add to `.env.local`:
  ```
  JOOBLE_API_KEY=04fca09b-40fe-4c47-b657-7112d915b166
  ```
- [ ] Get Adzuna API key from https://www.adzuna.com/api/register
- [ ] Add to `.env.local`:
  ```
  ADZUNA_API_KEY=app_id:app_key
  ```
- [ ] Add to `wrangler.toml` for production:
  ```toml
  [[env.production.secrets]]
  name = "JOOBLE_API_KEY"
  text = "04fca09b-40fe-4c47-b657-7112d915b166"
  
  [[env.production.secrets]]
  name = "ADZUNA_API_KEY"
  text = "your_adzuna_key"
  ```

#### 1.2 Verify Setup
- [ ] Run type check: `npm run type-check`
- [ ] Run tests: `npm test -- src/lib/services/__tests__/job-aggregator.test.ts`
- [ ] All tests pass ✓

### Phase 2: API Integration (1-2 hours)

#### 2.1 Create API Route
- [ ] Create `src/routes/api/jobs/search.ts`
- [ ] Copy example from [INTEGRATION.md](src/lib/services/INTEGRATION.md#step-2-create-an-api-route)
- [ ] Test route locally:
  ```bash
  npm run dev
  curl -X POST http://localhost:3003/api/jobs/search \
    -H "Content-Type: application/json" \
    -d '{"keywords":"Engineer","location":"Remote","limit":50}'
  ```

#### 2.2 Create React Query Hook
- [ ] Create `src/hooks/useJobSearch.ts`
- [ ] Copy example from [INTEGRATION.md](src/lib/services/INTEGRATION.md#step-3-create-a-react-query-hook)
- [ ] Test hook in component

### Phase 3: UI Implementation (2-3 hours)

#### 3.1 Create Search Component
- [ ] Create `src/components/JobSearch.tsx`
- [ ] Add search form (keywords + location)
- [ ] Display loading state
- [ ] Show error messages
- [ ] List results with job card UI

#### 3.2 Create Job Card Component
- [ ] Display: title, company, location, salary, source badge
- [ ] Link to job URL (external)
- [ ] Show "posted date" if available
- [ ] Add "Save" or "Apply" action (optional)

#### 3.3 Test UI
- [ ] Search for jobs
- [ ] Verify results from all sources
- [ ] Check source indicators
- [ ] Verify salary display
- [ ] Test error handling (invalid search)

### Phase 4: Optional Enhancements (1-2 days)

#### 4.1 Database Integration
- [ ] Create D1 schema for jobs table
- [ ] Modify API route to store results in D1
- [ ] Add "recently viewed" jobs query
- [ ] Implement "save job" functionality

#### 4.2 Job Matching
- [ ] Create job matching algorithm
- [ ] Score jobs against user resume
- [ ] Rank by relevance
- [ ] Show match percentage

#### 4.3 Analytics
- [ ] Track search queries
- [ ] Count jobs by source
- [ ] Monitor Jooble rate limit usage
- [ ] Dashboard with stats

#### 4.4 Scheduled Discovery
- [ ] Create background worker for hourly job refresh
- [ ] Store new jobs in D1
- [ ] Send email/Slack notifications

### Phase 5: Deployment

#### 5.1 Staging
- [ ] Test on staging environment
- [ ] Verify API credentials work
- [ ] Load test (monitor KV usage)
- [ ] Check response times

#### 5.2 Production
- [ ] Deploy with `npm run deploy`
- [ ] Monitor error rates
- [ ] Watch Jooble API quota (500 req/month)
- [ ] Set up alerts for failures

## 📊 Quick Reference

### File Locations
- **Service code**: `src/lib/services/`
- **Tests**: `src/lib/services/__tests__/`
- **Examples**: `src/lib/services/example.ts`
- **Docs**: See files in `src/lib/services/`

### Key APIs
```typescript
// Initialize
const aggregator = new JobAggregatorService(kv, adzunaKey, joobleKey);

// Search
const result = await aggregator.search({
  keywords: string,
  location: string,
  limit?: number,
  sources?: ('adzuna' | 'jooble' | 'remotive')[]
});

// Result structure
{
  jobs: UnifiedJob[],
  sources: {
    adzuna?: { success, count, error? },
    jooble?: { success, count, error? },
    remotive?: { success, count, error? }
  },
  deduped: number
}
```

### Helpful Commands
```bash
# Type check
npm run type-check

# Run tests
npm test -- src/lib/services/__tests__/job-aggregator.test.ts

# Development server
npm run dev

# Production build
npm run build && npm run deploy
```

## 🐛 Troubleshooting

**"Cannot find module '@/lib/services'"**
- Verify `tsconfig.json` has path alias: `"@/*": ["./src/*"]`

**"Jooble API returns 400"**
- Check JOOBLE_API_KEY is set
- Verify request body is JSON (not URL params)
- Check rate limit hasn't been exceeded (500 requests/month)

**"No results from Adzuna"**
- Verify `ADZUNA_API_KEY` format is `app_id:app_key`
- Check that `country` param is set to `us`

**"Cache not working"**
- Verify KV namespace is bound in `wrangler.toml`
- Check KV quota (watch for high read/write costs)

## 📝 Notes

- Jooble API is actively maintained (replaced Proxycurl)
- All sources cached for 1 hour in KV
- Promise.allSettled() ensures partial failures don't block
- Deduplication prevents same job from multiple sources
- SubtleCrypto ensures Worker compatibility (no Node.js deps)

---

**Expected timeline**: 1-2 days for full integration + UI
**Difficulty**: Moderate (straightforward API integration)
**Risk**: Low (well-tested, documented, error-resilient)

Start with Phase 1 (Setup) and Phase 2 (API), then add UI in Phase 3.

# Enhanced UI Integration Checklist

Use this to integrate the new search UI components into your Caliber application.

## Phase 1: Setup (30 minutes)

- [ ] **Verify API credentials are set**
  ```bash
  # Check .env.local has:
  ADZUNA_API_KEY=app_id:app_key
  JOOBLE_API_KEY=04fca09b-40fe-4c47-b657-7112d915b166
  ```

- [ ] **Verify wrangler.toml has secrets** (for production)
  ```toml
  [[env.production.secrets]]
  name = "ADZUNA_API_KEY"
  text = "app_id:app_key"
  
  [[env.production.secrets]]
  name = "JOOBLE_API_KEY"
  text = "04fca09b-40fe-4c47-b657-7112d915b166"
  ```

- [ ] **Type check passes**
  ```bash
  npm run type-check
  ```

## Phase 2: Basic Integration (1 hour)

### Option A: Add to New Page

- [ ] Create new route (or use existing `/jobs`)
  ```tsx
  // src/routes/job-search.tsx
  import { EnhancedJobSearch } from '@/components/features/enhanced-job-search';
  import { AggregatedJobsResults } from '@/components/features/aggregated-jobs-results';
  ```

- [ ] Add state management
  ```tsx
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState(null);
  ```

- [ ] Render components
  ```tsx
  <Button onClick={() => setSearchOpen(true)}>Search Jobs</Button>
  
  <EnhancedJobSearch
    open={searchOpen}
    onOpenChange={setSearchOpen}
    onSearchComplete={setResults}
  />
  
  {results && (
    <AggregatedJobsResults jobs={results.jobs} />
  )}
  ```

- [ ] Test search with keywords: "TypeScript Engineer"
  - Expected: Results from all 3 sources
  - Verify: Source badges display correctly

### Option B: Add to Existing Jobs Route

- [ ] Import components at top of `src/routes/jobs.tsx`
- [ ] Add state for aggregated search
- [ ] Add button to trigger search
- [ ] Render alongside existing search/results
- [ ] Test integration with existing UI

## Phase 3: Data Persistence (1-2 hours)

- [ ] **Create "Save Job" endpoint** (optional)
  ```typescript
  // src/routes/api/saved-jobs.ts
  export async function POST({ request, context }: any) {
    const job = await request.json();
    // Save to D1 database
    return json({ success: true });
  }
  ```

- [ ] **Create saved jobs schema** (optional)
  ```typescript
  // In your D1 schema
  create table saved_jobs (
    id integer primary key,
    user_id text,
    job_id text,
    job_source text,
    job_data json,
    created_at timestamp default current_timestamp
  )
  ```

- [ ] **Add onSaveJob handler**
  ```tsx
  <AggregatedJobsResults
    onSaveJob={async (job) => {
      await fetch('/api/saved-jobs', {
        method: 'POST',
        body: JSON.stringify(job)
      });
    }}
  />
  ```

## Phase 4: Analysis Integration (1-2 hours)

- [ ] **Create analysis endpoint** (optional)
  ```typescript
  // src/routes/api/analyze-job.ts
  export async function POST({ request, context }: any) {
    const job = await request.json();
    // Call AI analysis (existing logic)
    return json({ analysis: '...' });
  }
  ```

- [ ] **Add onAnalyzeJob handler**
  ```tsx
  <AggregatedJobsResults
    onAnalyzeJob={async (job) => {
      const response = await fetch('/api/analyze-job', {
        method: 'POST',
        body: JSON.stringify(job)
      });
      const { analysis } = await response.json();
      showAnalysisModal(analysis);
    }}
  />
  ```

- [ ] **Create AnalysisModal** (reuse existing?)
  - Display analysis results
  - Show job and analysis side-by-side

## Phase 5: Testing (30 minutes)

### Manual Testing

- [ ] **Search Functionality**
  - [ ] Search with keywords only
  - [ ] Search with location
  - [ ] Toggle remote only
  - [ ] Select/deselect sources
  - [ ] Verify results appear

- [ ] **Filtering & Sorting**
  - [ ] Filter by source
  - [ ] Filter by remote
  - [ ] Search within results
  - [ ] Sort by date
  - [ ] Sort by salary (high→low)
  - [ ] Pagination works

- [ ] **Error Handling**
  - [ ] Search with no keywords (error)
  - [ ] One API fails (other sources work)
  - [ ] Network error (graceful message)

- [ ] **Job Cards**
  - [ ] View job opens externally
  - [ ] Save job works (if implemented)
  - [ ] Analyze job works (if implemented)
  - [ ] Source badges display

- [ ] **Mobile Responsive**
  - [ ] Works on iPhone/Android
  - [ ] Touch-friendly buttons
  - [ ] Form is readable
  - [ ] Results scroll smoothly

### Automated Testing (optional)

```bash
npm test -- src/components/features/aggregated-job-card.test.ts
npm test -- src/components/features/enhanced-job-search.test.ts
npm test -- src/components/features/aggregated-jobs-results.test.ts
```

## Phase 6: Performance & Monitoring (optional)

- [ ] **Monitor API usage**
  ```typescript
  // Track Jooble API calls
  const status = await getRateLimitStatus(kv);
  if (status.percentUsed > 80) {
    // Alert
  }
  ```

- [ ] **Add analytics**
  ```typescript
  analytics.track('job_search', {
    keywords,
    sources,
    results_count,
    time_ms
  });
  ```

- [ ] **Monitor error rates**
  - Track failed searches
  - Monitor 429 rate limit errors
  - Alert on API failures

## Phase 7: Customization (optional)

- [ ] **Adjust PAGE_SIZE**
  ```typescript
  // aggregated-jobs-results.tsx
  const PAGE_SIZE = 15; // Was 10
  ```

- [ ] **Add new filters**
  ```typescript
  type FilterOption = '...' | 'senior-level' | 'startup-only';
  ```

- [ ] **Customize sort options**
  ```typescript
  type SortOption = '...' | 'relevance' | 'match_score';
  ```

- [ ] **Adjust timeout for searches**
  ```typescript
  const timeout = 10000; // 10 seconds
  ```

## Deployment Checklist

Before deploying to production:

- [ ] API credentials in `wrangler.toml`
- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] No console errors
- [ ] Mobile testing done
- [ ] Rate limiting monitored
- [ ] Error handling verified
- [ ] Performance acceptable

## Quick Verification

Run these commands to verify everything works:

```bash
# Type check
npm run type-check

# Test
npm test -- src/components/features

# Build (if using build step)
npm run build

# Run dev server
npm run dev

# Visit http://localhost:3003 and test search
```

## Documentation Files

- **ENHANCED_UI_README.md** — Component API and usage
- **ENHANCED_UI_SUMMARY.md** — Integration guide and features
- **src/components/features/aggregated-job-card.tsx** — Job card component
- **src/components/features/aggregated-jobs-results.tsx** — Results view component
- **src/components/features/enhanced-job-search.tsx** — Search form component
- **src/routes/api/jobs/search.ts** — API endpoint

## Timeline

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Setup credentials | 30 min |
| 2 | Basic integration | 1 hour |
| 3 | Data persistence | 1-2 hours |
| 4 | Analysis integration | 1-2 hours |
| 5 | Testing | 30 min |
| 6 | Performance | 30 min |
| 7 | Customization | 1 hour |

**Total: 5-8 hours** for full integration

## Common Issues & Solutions

**"Cannot find module" error**
- Check import paths are correct
- Verify files exist in src/components/features/
- Run `npm run type-check` to find issues

**"API returns 401/403"**
- Verify ADZUNA_API_KEY format (app_id:app_key)
- Check JOOBLE_API_KEY is correct
- Ensure keys are passed to JobAggregatorService

**No results returned**
- Check browser console for errors
- Verify API credentials are set
- Check rate limit status (Jooble: 500/month)
- Try different search terms

**Styling looks broken**
- Ensure @caliber/ui-kit is installed
- Check Tailwind CSS is configured
- Verify lucide-react icons are available
- Clear browser cache

**Performance is slow**
- Cold query (2-5s) is expected for first search
- Cached queries (<50ms) should be instant
- Monitor KV operations in logs
- Check network waterfall in DevTools

## Next Steps After Integration

1. **Gather user feedback** on UX
2. **Monitor API usage** (Jooble quota)
3. **Add analytics** to track popular searches
4. **Implement bookmarking** (save jobs)
5. **Add recommendations** (ML-powered)

---

**Need help?** See:
- ENHANCED_UI_README.md for API reference
- ENHANCED_UI_SUMMARY.md for integration examples
- src/lib/services/INTEGRATION.md for backend details

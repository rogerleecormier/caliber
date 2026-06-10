# Enhanced Job Search UI/UX

Comprehensive, modern job search interface that integrates the multi-source job aggregation service with filtering, sorting, and analysis capabilities.

## Components

### 1. EnhancedJobSearch
**File**: `enhanced-job-search.tsx`

Main search interface with form and real-time results.

**Features**:
- Keywords and location input with autocomplete
- Remote-only toggle
- Source selection (Adzuna, Jooble, Remotive)
- Results per source limit (10-100)
- Real-time search feedback
- Source status indicators (success/failure)
- Results preview with salary display

**Props**:
```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchComplete?: (result: SearchResult) => void;
}
```

**Usage**:
```tsx
const [open, setOpen] = useState(false);

<EnhancedJobSearch
  open={open}
  onOpenChange={setOpen}
  onSearchComplete={(results) => {
    console.log(`Found ${results.jobs.length} jobs`);
  }}
/>
```

### 2. AggregatedJobCard
**File**: `aggregated-job-card.tsx`

Individual job listing card with source indicator and actions.

**Features**:
- Source-based color coding (Adzuna=blue, Jooble=orange, Remotive=green)
- Location, salary, and job type display
- Job description preview (2-line truncate)
- External link to job posting
- Save for later (bookmark)
- Analysis trigger (Sparkles button)
- Error state handling

**Props**:
```typescript
{
  job: AggregatedJobCardJob;
  onSave?: (job) => Promise<void>;
  isSaved?: boolean;
  onAnalyze?: (job) => Promise<void>;
  isAnalyzing?: boolean;
}
```

**Usage**:
```tsx
<AggregatedJobCard
  job={jobData}
  onSave={async (job) => {
    // Save to database
  }}
  isSaved={false}
  onAnalyze={async (job) => {
    // Trigger AI analysis
  }}
/>
```

### 3. AggregatedJobsResults
**File**: `aggregated-jobs-results.tsx`

Full results view with filtering, sorting, and pagination.

**Features**:
- Full-text search (title, company, location)
- Source filter (all, Adzuna, Jooble, Remotive, Remote-only)
- Sorting (newest, salary high→low, title A→Z, company A→Z)
- 10 jobs per page with pagination
- Result count summary
- Loading state

**Props**:
```typescript
{
  jobs: AggregatedJobCardJob[];
  loading?: boolean;
  onSaveJob?: (job) => Promise<void>;
  onAnalyzeJob?: (job) => Promise<void>;
  savedJobIds?: Set<string>;
}
```

**Usage**:
```tsx
<AggregatedJobsResults
  jobs={searchResults}
  loading={isSearching}
  onSaveJob={saveToDatabase}
  onAnalyzeJob={analyzeWithAI}
  savedJobIds={savedJobIdSet}
/>
```

## API Route

### POST /api/jobs/search

**Request**:
```typescript
{
  keywords: string;      // Required
  location?: string;     // Default: "United States"
  limit?: number;        // Default: 50, Max: 100
  sources?: string[];    // Default: ['adzuna', 'jooble', 'remotive']
}
```

**Response**:
```typescript
{
  success: boolean;
  data?: {
    jobs: {
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
    }[];
    sources: {
      [source: string]: {
        success: boolean;
        count: number;
        error?: string;
      };
    };
    deduped: number;
  };
  error?: string;
}
```

## Integration Examples

### Full Page Implementation

```tsx
import { useState } from 'react';
import { PageHero, Button } from '@caliber/ui-kit';
import { Search } from 'lucide-react';
import { EnhancedJobSearch } from '@/components/features/enhanced-job-search';
import { AggregatedJobsResults } from '@/components/features/aggregated-jobs-results';

export default function JobSearchPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  return (
    <div>
      <PageHero title="Job Search" subtitle="Find opportunities across multiple sources" />

      <Button onClick={() => setSearchOpen(true)}>
        <Search className="mr-2" />
        Start Search
      </Button>

      <EnhancedJobSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSearchComplete={(result) => {
          setResults(result);
          setSearchOpen(false);
        }}
      />

      {results && (
        <AggregatedJobsResults
          jobs={results.jobs}
          onSaveJob={async (job) => {
            // Save to your database
          }}
          onAnalyzeJob={async (job) => {
            // Trigger AI analysis
          }}
        />
      )}
    </div>
  );
}
```

### In Existing Jobs Route

Integrate with your existing `/jobs` route:

```tsx
// src/routes/jobs.tsx
import { EnhancedJobSearch } from '@/components/features/enhanced-job-search';
import { AggregatedJobsResults } from '@/components/features/aggregated-jobs-results';

export const Route = createFileRoute('/jobs')({
  // ... existing config
  component: JobsPage,
});

function JobsPage() {
  const [aggregatedResults, setAggregatedResults] = useState(null);

  return (
    <>
      {/* Existing job search drawer */}
      <AgentsSearchDrawer open={agentSearchOpen} {...props} />

      {/* New aggregated search */}
      <EnhancedJobSearch
        open={aggregatedSearchOpen}
        onOpenChange={setAggregatedSearchOpen}
        onSearchComplete={setAggregatedResults}
      />

      {/* Show aggregated results if available */}
      {aggregatedResults ? (
        <AggregatedJobsResults
          jobs={aggregatedResults.jobs}
          onSaveJob={saveJobToDatabase}
        />
      ) : (
        // Show existing pipeline results
        <JobResultCard {...props} />
      )}
    </>
  );
}
```

## UI/UX Features

### Visual Design
- **Source color coding**: Quick visual identification of job source
- **Icons**: Clear, consistent icons for location, salary, job type, dates
- **Cards**: Spacious card layout with good typography hierarchy
- **Responsive**: Works on mobile (sheet) and desktop (drawer)

### Interaction Patterns
- **Real-time search**: Immediate feedback on search progress
- **Error handling**: Clear error messages with context
- **Loading states**: Spinner animations during search and actions
- **Confirmation**: Toast/dialog for save and analysis actions
- **Tooltips**: Help text for complex filters

### Accessibility
- Semantic HTML (forms, labels, buttons)
- ARIA labels on interactive elements
- Keyboard navigation support
- Color not sole differentiator (icons + text)
- Sufficient contrast ratios

## Customization

### Change Results Per Page
```tsx
// In aggregated-jobs-results.tsx
const PAGE_SIZE = 20; // Was 10
```

### Add Custom Source
```tsx
// In enhanced-job-search.tsx
const SOURCE_ICONS = {
  // ... existing sources
  custom: '🔹',
};

const SOURCE_DESCRIPTIONS = {
  // ... existing sources
  custom: 'Custom job source',
};
```

### Modify Sort Options
```tsx
type SortOption = 'posted-date' | 'salary-high' | 'salary-low' | 'title' | 'company' | 'relevance';

// Add in AggregatedJobsResults
case 'relevance':
  // Custom relevance scoring
  break;
```

## Performance Optimizations

- **Memoization**: useMemo for filtering, sorting, pagination
- **Lazy loading**: Pagination reduces DOM size
- **Debouncing**: Search input debounced (via component logic)
- **Caching**: API results cached in KV for 1 hour

## Testing

### Unit Tests
```typescript
describe('AggregatedJobCard', () => {
  it('should display job title and company', () => {
    // ...
  });

  it('should call onSave when bookmark clicked', () => {
    // ...
  });
});
```

### Integration Tests
```typescript
describe('EnhancedJobSearch', () => {
  it('should fetch jobs from API', async () => {
    // ...
  });

  it('should display results after search', async () => {
    // ...
  });
});
```

## Future Enhancements

### Short-term
- [ ] Save search presets
- [ ] Email job alerts
- [ ] Export results (CSV/PDF)
- [ ] Advanced filters (salary range, company size)

### Medium-term
- [ ] AI-powered recommendations
- [ ] Job matching against resume
- [ ] Salary insights/trends
- [ ] Company reviews integration

### Long-term
- [ ] Mobile app
- [ ] Browser extension
- [ ] Personalized job ranking
- [ ] Community features (job discussions)

## Troubleshooting

**Search returns no results**
- Check keywords are specific enough
- Verify location format (e.g., "Remote, United States")
- Try fewer filters/broader location

**API call fails**
- Verify ADZUNA_API_KEY and JOOBLE_API_KEY are set
- Check rate limit (Jooble: 500/month)
- See RATE_LIMITING_SUMMARY.md for quota details

**UI not displaying correctly**
- Ensure @caliber/ui-kit is imported
- Check Tailwind CSS is configured
- Verify lucide-react icons are available

## Files Modified/Created

- ✅ `src/components/features/enhanced-job-search.tsx` (NEW)
- ✅ `src/components/features/aggregated-job-card.tsx` (NEW)
- ✅ `src/components/features/aggregated-jobs-results.tsx` (NEW)
- ✅ `src/routes/api/jobs/search.ts` (NEW)
- ✅ `src/components/features/ENHANCED_UI_README.md` (THIS FILE)

---

**Status**: Ready for integration and testing
**Dependencies**: @caliber/ui-kit, lucide-react, React 19+
**Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)

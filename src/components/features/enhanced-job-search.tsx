import { type ChangeEvent, type FormEvent, useState, useCallback } from 'react';
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Badge,
  Checkbox,
} from '@caliber/ui-kit';
import {
  ChevronDown,
  CircleHelp,
  Loader2,
  Search,
  AlertCircle,
  CheckCircle,
  Globe,
  MapPin,
  DollarSign,
  Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AggregatedJobSearchParams {
  keywords: string;
  location: string;
  remote?: boolean;
  limit?: number;
  sources?: ('adzuna' | 'jooble' | 'remotive')[];
}

export interface AggregatedSearchJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  source: 'adzuna' | 'jooble' | 'remotive';
  postedDate?: Date | string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  description?: string;
  jobType?: 'full-time' | 'part-time' | 'contract' | 'temporary';
  remote?: boolean;
}

export interface SearchSourceStatus {
  source: 'adzuna' | 'jooble' | 'remotive';
  success: boolean;
  count: number;
  error?: string;
}

export interface SearchResult {
  jobs: AggregatedSearchJob[];
  sources: Record<string, SearchSourceStatus>;
  deduped: number;
  totalTime: number;
}

type FormState = {
  keywords: string;
  location: string;
  remote: boolean;
  sources: ('adzuna' | 'jooble' | 'remotive')[];
  limit: number;
};

interface EnhancedJobSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchComplete?: (result: SearchResult) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POPULAR_LOCATIONS = [
  'Remote, United States',
  'San Francisco, CA',
  'New York, NY',
  'Austin, TX',
  'Seattle, WA',
  'Los Angeles, CA',
  'Denver, CO',
  'Boston, MA',
  'Chicago, IL',
  'Miami, FL',
];

const SOURCE_ICONS: Record<'adzuna' | 'jooble' | 'remotive', string> = {
  adzuna: '🔷',
  jooble: '🔶',
  remotive: '🌍',
};

const SOURCE_DESCRIPTIONS: Record<'adzuna' | 'jooble' | 'remotive', string> = {
  adzuna: '100+ job sources',
  jooble: '150+ job sources',
  remotive: 'Remote-only positions',
};

const defaultForm: FormState = {
  keywords: '',
  location: 'Remote, United States',
  remote: true,
  sources: ['adzuna', 'jooble', 'remotive'],
  limit: 50,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EnhancedJobSearch({
  open,
  onOpenChange,
  onSearchComplete,
}: EnhancedJobSearchProps) {
  const [formState, setFormState] = useState<FormState>(defaultForm);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = useCallback((
    field: keyof FormState,
    value: string | boolean | ('adzuna' | 'jooble' | 'remotive')[]
  ) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSourceToggle = useCallback((source: 'adzuna' | 'jooble' | 'remotive') => {
    setFormState((prev) => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter((s) => s !== source)
        : [...prev.sources, source],
    }));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!formState.keywords.trim()) {
        setError('Please enter keywords');
        return;
      }

      if (formState.sources.length === 0) {
        setError('Please select at least one source');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const startTime = performance.now();

        const response = await fetch('/api/jobs/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords: formState.keywords,
            location: formState.location,
            limit: formState.limit,
            sources: formState.sources,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        const data = (await response.json()) as { data: SearchResult };
        const endTime = performance.now();

        const enrichedResult: SearchResult = {
          ...data.data,
          totalTime: Math.round(endTime - startTime),
        };

        setResult(enrichedResult);
        onSearchComplete?.(enrichedResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [formState, onSearchComplete]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Multi-Source Job Search
        </SheetTitle>
        <SheetDescription>
          Search across Adzuna, Jooble, and Remotive simultaneously.
        </SheetDescription>

        <div className="mt-6 space-y-6">
          {/* Search Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Keywords */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Keywords *
              </label>
              <Input
                type="text"
                placeholder="e.g., Senior Software Engineer, TypeScript, React"
                value={formState.keywords}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleInputChange('keywords', e.target.value)
                }
                disabled={isLoading}
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <MapPin className="h-4 w-4 inline mr-2" />
                Location
              </label>
              <Input
                type="text"
                placeholder="e.g., Remote, United States"
                value={formState.location}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleInputChange('location', e.target.value)
                }
                disabled={isLoading}
                list="locations"
              />
              <datalist id="locations">
                {POPULAR_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            {/* Remote Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remote"
                checked={formState.remote}
                onCheckedChange={(checked) =>
                  handleInputChange('remote', checked === true)
                }
                disabled={isLoading}
              />
              <label htmlFor="remote" className="text-sm font-medium cursor-pointer">
                <Globe className="h-4 w-4 inline mr-2" />
                Remote only
              </label>
            </div>

            {/* Results Limit */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <DollarSign className="h-4 w-4 inline mr-2" />
                Results per source
              </label>
              <Input
                type="number"
                min="10"
                max="100"
                value={formState.limit}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleInputChange('limit', parseInt(e.target.value, 10))
                }
                disabled={isLoading}
              />
            </div>

            {/* Source Selection */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <label className="block text-sm font-medium">
                  Data Sources
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-4 w-4 text-gray-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select sources to search. Results are deduplicated by URL.</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="space-y-2">
                {(['adzuna', 'jooble', 'remotive'] as const).map((source) => (
                  <div key={source} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Checkbox
                      id={`source-${source}`}
                      checked={formState.sources.includes(source)}
                      onCheckedChange={() => handleSourceToggle(source)}
                      disabled={isLoading}
                    />
                    <label
                      htmlFor={`source-${source}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{SOURCE_ICONS[source]}</span>
                        <div>
                          <div className="font-medium capitalize">{source}</div>
                          <div className="text-xs text-gray-600">
                            {SOURCE_DESCRIPTIONS[source]}
                          </div>
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Search Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || formState.sources.length === 0}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Jobs
                </>
              )}
            </Button>
          </form>

          {/* Results Summary */}
          {result && (
            <div className="border-t pt-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Search Results</h3>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>
                    <span className="font-medium">{result.jobs.length}</span> total jobs found
                    (removed <span className="font-medium">{result.deduped}</span> duplicates)
                  </p>
                  <p>
                    <Clock className="h-4 w-4 inline mr-1" />
                    Completed in <span className="font-medium">{result.totalTime}ms</span>
                  </p>
                </div>
              </div>

              {/* Source Status */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Source Status</h4>
                <div className="space-y-2">
                  {Object.entries(result.sources).map(([source, status]) => (
                    <div key={source} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {SOURCE_ICONS[source as 'adzuna' | 'jooble' | 'remotive']}
                        </span>
                        <span className="text-sm capitalize font-medium">{source}</span>
                      </div>
                      {status.success ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-700 font-medium">
                            {status.count} jobs
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-red-700 font-medium cursor-help">
                                Failed
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{status.error}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Results Preview */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Recent Results</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.jobs.slice(0, 5).map((job) => (
                    <div
                      key={`${job.source}-${job.id}`}
                      className="p-3 border rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-medium truncate">{job.title}</h5>
                          <p className="text-xs text-gray-600">{job.company}</p>
                        </div>
                        <Badge variant="outline" className="flex-shrink-0">
                          {SOURCE_ICONS[job.source]}
                          {job.source}
                        </Badge>
                      </div>
                      {job.salary && (
                        <p className="text-xs text-gray-700 mt-1">
                          ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()}{' '}
                          {job.salary.currency}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

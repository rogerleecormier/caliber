import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Briefcase,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Globe,
  Loader2,
  Search,
  Star,
  Table2,
  Sparkles,
} from "lucide-react";
import {
  PageHero,
} from "@caliber/ui-kit";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { JobResultCard } from "@/components/features/job-result-card";
import { AnalysisModal } from "@/components/features/analysis-modal";
import { UnifiedSearchPanel } from "@/components/features/unified-search-panel";
import { MasterSearchBar } from "@/components/features/master-search-bar";
import { getResume } from "@/server/functions/manage-resume";
import {
  getSavedPipelineSearches,
  getRecommendedJobs,
} from "@/server/functions/jobs-pipeline";
import { useCatalogQuery } from "@/hooks/useCatalogQuery";
import type { CatalogFilters } from "@/hooks/useCatalogQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = "posted-date" | "title" | "score" | "company" | "location";

type JobSearchInput = {
  page?: number;
  query?: string;
  remote?: boolean | string;
  sortBy?: SortOption;
  status?: string;
  analyzedOnly?: boolean | string;
  analyze?: boolean | string;
  url?: string;
  view?: 'my-jobs' | 'all-jobs' | 'quick-search' | 'search';
  catalogQuery?: string;
};

export type JobSearchParams = {
  page: number;
  query: string;
  remote: boolean;
  sortBy: SortOption;
  status: string;
  analyzedOnly: boolean;
  analyze?: boolean;
  url?: string;
  view: 'my-jobs' | 'all-jobs' | 'quick-search' | 'search';
  catalogQuery: string;
  favoritedOnly?: boolean;
};

type HubJob = {
  id: number | string;
  title?: string;
  sourceUrl?: string;
  analyzedAt?: string;
  currentStage?: string;
  matchScore?: number;
  pursueJustification?: string;
  gapAnalysis?: any;
  recommendations?: any;
  keywords?: any;
  pursue?: number;
  strategyNote?: string;
  personalInterest?: string;
  careerAnalysis?: any;
  insights?: any;
  jdText?: string;
  createdAt?: string;
  industry?: string;
  location?: string;
  company?: string;
  employerName?: string;
  jobTitle?: string;
  isNew?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_SORT_OPTIONS: SortOption[] = ["posted-date", "title", "score", "company", "location"];

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/jobs")({
  validateSearch: (search: Record<string, unknown> & JobSearchInput): JobSearchParams => ({
    page: Math.max(1, Number(search.page) || 1),
    query: String(search.query ?? ""),
    remote: search.remote === true || search.remote === "true",
    sortBy: (VALID_SORT_OPTIONS.includes(search.sortBy as SortOption)
      ? search.sortBy
      : "posted-date") as SortOption,
    status: typeof search.status === "string" ? search.status : "",
    analyzedOnly: search.analyzedOnly === true || search.analyzedOnly === "true",
    analyze: search.analyze === true || search.analyze === "true" ? true : undefined,
    url: typeof search.url === "string" && search.url.trim() !== "" ? search.url.trim() : undefined,
    view: (['my-jobs', 'all-jobs', 'quick-search', 'search'].includes(search.view as string)
      ? search.view
      : "my-jobs") as any,
    catalogQuery: typeof search.catalogQuery === 'string' ? search.catalogQuery : '',
  }),
  loaderDeps: ({ search }: { search: JobSearchParams }) => search,
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async ({ deps }: { deps: JobSearchParams }) => {
    const [resume, savedSearches, recommendedRes] = await Promise.all([
      getResume(),
      getSavedPipelineSearches(),
      deps.view === "all-jobs" ? getRecommendedJobs() : Promise.resolve({ jobs: [] }),
    ]);

    return {
      hasResume: !!resume?.rawText,
      savedSearches,
      recommendedJobs: recommendedRes.jobs,
    };
  },
  component: JobsPage,
});

// ─── Page component ───────────────────────────────────────────────────────────

type ViewMode = "cards" | "table";

const DEFAULT_FILTERS: CatalogFilters = {
  query: '',
  remote: undefined,
  company: '',
  ats: '',
  salaryMin: 0,
  location: '',
  page: 1,
};

function JobsPage() {
  const { catalogQuery } = Route.useSearch();
  const loaderData = Route.useLoaderData() as any;
  const { hasResume, savedSearches: loaderSavedSearches } = loaderData;

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<HubJob | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<any>(null);

  // Master filter state lives here so UnifiedSearchPanel can read active filters
  const [filters, setFilters] = useState<CatalogFilters>({
    ...DEFAULT_FILTERS,
    query: catalogQuery ?? '',
  });

  // Sync query param → filter state when navigating via URL
  useEffect(() => {
    if (catalogQuery) {
      setFilters((prev) => ({ ...prev, query: catalogQuery, page: 1 }));
    }
  }, [catalogQuery]);

  const setFilter = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: key !== 'page' ? 1 : prev.page }));
  };

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  function openAnalysisModal(job: any) {
    setSelectedJobForAnalysis(job);
    setStoredAnalysis(null);

    if (job.analyzedAt || job.currentStage === "Analyzed") {
      const analysis = {
        id: job.id,
        jobTitle: job.title || job.jobTitle,
        company: job.company || job.employerName,
        industry: job.industry ?? undefined,
        location: job.location ?? undefined,
        matchScore: job.matchScore ?? 0,
        pursueJustification: job.pursueJustification ?? "No justification provided",
        gapAnalysis: job.gapAnalysis ? (typeof job.gapAnalysis === "string" ? JSON.parse(job.gapAnalysis) : job.gapAnalysis) : [],
        recommendations: job.recommendations ? (typeof job.recommendations === "string" ? JSON.parse(job.recommendations) : job.recommendations) : [],
        keywords: job.keywords ? (typeof job.keywords === "string" ? JSON.parse(job.keywords) : job.keywords) : [],
        pursue: job.pursue === 1,
        strategyNote: job.strategyNote ?? "",
        personalInterest: job.personalInterest ?? "",
        careerAnalysis: job.careerAnalysis ? (typeof job.careerAnalysis === "string" ? JSON.parse(job.careerAnalysis) : job.careerAnalysis) : null,
        insights: job.insights ? (typeof job.insights === "string" ? JSON.parse(job.insights) : job.insights) : null,
        applied: false,
        appliedAt: null,
        jobUrl: job.sourceUrl,
        jdText: job.jdText,
        createdAt: job.analyzedAt ?? job.createdAt,
      };
      setStoredAnalysis(analysis);
    }

    setAnalysisModalOpen(true);
  }

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Caliber"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="All Jobs"
        description={
          loaderData.canViewAllUsers
            ? "Browse all users' agent jobs and manage the full pipeline."
            : "Search across Greenhouse, Lever, Adzuna, Jooble, Remotive, and more — favorite any job to add it to your pipeline."
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Link
              to="/insights"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white hover:border-slate-300"
            >
              <BarChart3 className="h-4 w-4" />
              Insights
            </Link>
          </div>
        }
      />

      {/* ── Master search + filters ──────────────────────────────────────── */}
      <MasterSearchBar
        filters={filters}
        onChange={setFilter}
        onClearAll={clearFilters}
      />

      {/* ── Search agents ────────────────────────────────────────────────── */}
      <UnifiedSearchPanel
        initialSavedSearches={loaderSavedSearches}
        hasResume={hasResume}
        activeFilters={filters}
      />

      <CatalogBrowser
        onAnalyzeClick={openAnalysisModal}
        viewMode={viewMode}
        setViewMode={setViewMode}
        recommendedJobs={loaderData.recommendedJobs}
        filters={filters}
        setFilter={setFilter}
      />

      <AnalysisModal
        isOpen={analysisModalOpen}
        jobTitle={selectedJobForAnalysis?.title}
        jobUrl={selectedJobForAnalysis?.sourceUrl}
        onClose={() => {
          setAnalysisModalOpen(false);
          setSelectedJobForAnalysis(null);
          setStoredAnalysis(null);
        }}
        isFromExistingJob={!!selectedJobForAnalysis}
        storedAnalysis={storedAnalysis}
        pipelineJobId={selectedJobForAnalysis?.id as number | undefined}
        onAnalysisComplete={() => {}}
        onDocumentGenerated={() => {}}
      />

    </div>
  );
}

// ─── Catalog Browser ──────────────────────────────────────────────────────────

const atsBadgeClass: Record<string, string> = {
  greenhouse: 'bg-emerald-100 text-emerald-700',
  lever: 'bg-indigo-100 text-indigo-700',
  workable: 'bg-sky-100 text-sky-700',
  ashby: 'bg-violet-100 text-violet-700',
  adzuna: 'bg-orange-100 text-orange-700',
  jooble: 'bg-yellow-100 text-yellow-700',
  remotive: 'bg-teal-100 text-teal-700',
  remoteok: 'bg-pink-100 text-pink-700',
  himalayas: 'bg-cyan-100 text-cyan-700',
  jobicy: 'bg-lime-100 text-lime-700',
  manual: 'bg-slate-100 text-slate-600',
};

function formatSalary(min?: number | null, max?: number | null) {
  if (!min && !max) return null;
  const fmt = (n: number) => `$${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (max) return `Up to ${fmt(max)}`;
  return `${fmt(min!)}+`;
}

function CatalogBrowser({
  onAnalyzeClick,
  viewMode,
  setViewMode,
  recommendedJobs,
  filters,
  setFilter,
}: {
  onAnalyzeClick: (job: any) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  recommendedJobs: any[];
  filters: CatalogFilters;
  setFilter: <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => void;
}) {
  const {
    data,
    isFetching,
    isLoading,
    starMutation,
    prefetchPage,
    totalPages,
    isDebouncing,
  } = useCatalogQuery(filters);

  const handlePageChange = (p: number) => {
    setFilter('page', p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStar = (job: any) => {
    starMutation.mutate({ canonicalJobId: job.id, star: !job.isFavorited });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Job Catalog</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {(isFetching || isDebouncing) ? (
              <span className="inline-flex items-center gap-1.5 text-indigo-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </span>
            ) : data
              ? `${data.total.toLocaleString()} jobs · ⭐ Favorite any job to add it to My Jobs`
              : 'Loading catalog…'}
          </p>
        </div>
        {/* View Toggle */}
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "cards"
                ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Card view"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Table view"
          >
            <Table2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {/* Recommended Jobs */}
      {recommendedJobs && recommendedJobs.length > 0 && (
        <div className="space-y-4 mb-8">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
              AI-Recommended Jobs
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Top vector matches with custom AI Quick Analysis synthesized for you.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {recommendedJobs.slice(0, 3).map((job: any) => {
              const cardJob = {
                ...job,
                title: job.jobTitle || job.title,
                company: job.employerName || job.company,
                location: job.location,
                sourceUrl: job.sourceUrl,
                snippet: job.snippet || (job.description ? job.description.substring(0, 300) : ''),
                isFavorited: job.isFavorited === 1 || job.isFavorited === true,
                isSaved: job.isSaved === 1 || job.isSaved === true,
              };
              return (
                <JobResultCard
                  key={job.id}
                  job={{
                    ...cardJob,
                    firstSeenAt: job.discoveryTimestamp || job.createdAt,
                  }}
                  isRecommendation={true}
                  isHorizontal={true}
                  isFavorited={job.isFavorited === 1 || job.isFavorited === true}
                  onToggleFavorite={() => handleStar(job)}
                  onAnalyzeClick={() => {
                    onAnalyzeClick({
                      ...job,
                      title: job.jobTitle || job.title,
                      company: job.employerName || job.company,
                      sourceUrl: job.sourceUrl,
                    });
                  }}
                  onApplyClick={() => {}}
                />
              );
            })}
          </div>
          <div className="border-b border-slate-200/60 pt-4" />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 text-slate-300 mx-auto mb-3 animate-spin" />
          <p className="text-slate-400 text-sm">Loading catalog…</p>
        </div>
      ) : data && data.jobs.length > 0 ? (
        <>
          {viewMode === "cards" ? (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {data.jobs.map((job) => {
                const cardJob = {
                  title: job.titleDisplay,
                  company: job.companyDisplay,
                  location: job.locationDisplay,
                  sourceUrl: job.applyUrl ?? job.sourceUrl ?? '',
                  salary: formatSalary(job.compensationMin, job.compensationMax),
                  snippet: job.descriptionPlain ? job.descriptionPlain.substring(0, 300) : null,
                  description: job.descriptionPlain ?? null,
                  firstSeenAt: job.firstSeenAt,
                  postDateText: job.sourceCreatedAt,
                  sourceOrigin: job.ats,
                  isSaved: job.isSaved,
                  isFavorited: job.isFavorited,
                };

                return (
                  <JobResultCard
                    key={job.id}
                    job={cardJob}
                    isNew={false}
                    showSelection={false}
                    onAnalyzeClick={() => {
                      onAnalyzeClick({
                        ...job,
                        title: job.titleDisplay,
                        company: job.companyDisplay,
                        sourceUrl: job.applyUrl ?? job.sourceUrl,
                      });
                    }}
                    isFavorited={job.isFavorited}
                    onToggleFavorite={() => handleStar(job)}
                    onApplyClick={() => {}}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className={`divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm transition-opacity ${
                isFetching ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {data.jobs.map((job) => {
                const salary = formatSalary(job.compensationMin, job.compensationMax);
                const badgeCls = atsBadgeClass[job.ats ?? ''] ?? 'bg-slate-100 text-slate-600';
                const isStarring = starMutation.isPending && (starMutation.variables as any)?.canonicalJobId === job.id;

                return (
                  <div
                    key={job.id}
                    className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/80 transition group"
                  >
                    {/* Star */}
                    <button
                      onClick={() => handleStar(job)}
                      disabled={isStarring}
                      title={job.isFavorited ? 'Remove from My Jobs' : 'Favorite to add to My Jobs'}
                      className={`mt-0.5 flex-shrink-0 transition-all ${
                        job.isFavorited ? 'text-amber-400 scale-110' : 'text-slate-200 hover:text-amber-400 hover:scale-110'
                      } ${isStarring ? 'opacity-50 animate-pulse' : ''}`}
                    >
                      <Star className="h-5 w-5" fill={job.isFavorited ? 'currentColor' : 'none'} strokeWidth={1.5} />
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{job.titleDisplay}</p>
                          <p className="text-sm text-slate-500 mt-0.5 truncate">{job.companyDisplay}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {job.ats && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${badgeCls}`}>
                              {job.ats}
                            </span>
                          )}
                          {job.remote && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-bold">
                              <Globe className="h-3 w-3" />
                              Remote
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] text-slate-400">
                        {job.locationDisplay && <span>{job.locationDisplay}</span>}
                        {salary && <span className="text-emerald-600 font-semibold">{salary}</span>}
                        {job.experienceLevel && <span className="capitalize">{job.experienceLevel.replace(/_/g, ' ')}</span>}
                        {job.lastSeenAt && (
                          <span>{new Date(job.lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        )}
                        {job.isSaved && !job.isFavorited && (
                          <span className="text-slate-400 italic">in pipeline</span>
                        )}
                      </div>
                    </div>

                    {/* Hover actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                      {(job.applyUrl || job.sourceUrl) && (
                        <a
                          href={job.applyUrl ?? job.sourceUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {}}
                          className="px-2.5 py-1 text-[12px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                        >
                          Apply
                        </a>
                      )}
                      <button
                        onClick={() => {
                          onAnalyzeClick({
                            ...job,
                            title: job.titleDisplay,
                            company: job.companyDisplay,
                            sourceUrl: job.applyUrl ?? job.sourceUrl,
                          });
                        }}
                        className="px-2.5 py-1 text-[12px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition"
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-slate-500">
                Page {filters.page} of {totalPages} &middot; {data.total.toLocaleString()} jobs
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(filters.page - 1)}
                  disabled={filters.page <= 1}
                  onMouseEnter={() => filters.page > 1 && prefetchPage(filters.page - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const p = filters.page;
                  const n = totalPages;
                  const pg = n <= 7 ? i + 1 : p <= 4 ? i + 1 : p >= n - 3 ? n - 6 + i : p - 3 + i;
                  return (
                    <button
                      key={pg}
                      onClick={() => handlePageChange(pg)}
                      onMouseEnter={() => pg !== p && prefetchPage(pg)}
                      className={`min-w-[32px] h-8 px-2 text-sm rounded-lg border transition ${
                        pg === p
                          ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  onClick={() => handlePageChange(filters.page + 1)}
                  disabled={filters.page >= totalPages}
                  onMouseEnter={() => filters.page < totalPages && prefetchPage(filters.page + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : data ? (
        <div className="text-center py-16 border border-slate-200 rounded-xl bg-white">
          <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No jobs match your filters</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your search or clearing filters</p>
        </div>
      ) : null}
    </div>
  );
}

import { createFileRoute, Link, defer } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  Archive,
  BookMarked,
  Briefcase,
  BarChart3,
  Grid3x3,
  Loader2,
  Search,
  Table2,
  Trash2,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Input,
  PageActionBar,
  PageHero,
  PageSection,
  Pagination,
} from "@caliber/ui-kit";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import {
  JobResultCard,
  type JobStatus,
} from "@/components/features/job-result-card";
import { AgentsSearchDrawer } from "@/components/features/agents-search-drawer";
import { AnalysisModal } from "@/components/features/analysis-modal";
import type { AnalysisData } from "@/components/features/analysis-form";
import { JobTableView } from "@/components/features/job-table-view";
import { EnhancedJobSearch } from "@/components/features/enhanced-job-search";
import { AggregatedJobsResults } from "@/components/features/aggregated-jobs-results";
import { getResume } from "@/server/functions/manage-resume";
import {
  archivePipelineJobs,
  deletePipelineJobs,
  getPipelineCronInfo,
  getPipelineJobHistory,
  getSavedPipelineSearches,
  setPipelineJobStatus,
} from "@/server/functions/jobs-pipeline";
import type { LinkedInScrapedJob } from "@/lib/linkedin-search";
import {
  PIPELINE_STATUSES,
  STATUS_TONES,
} from "@/lib/pipeline-constants";
import { useJobsQuery } from "@/hooks/useJobsQuery";

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
};

type HubJob = Awaited<ReturnType<typeof getPipelineJobHistory>>["rows"][number] & {
  isNew?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VALID_SORT_OPTIONS: SortOption[] = ["posted-date", "title", "score", "company", "location"];
const JOB_STATUSES = PIPELINE_STATUSES as unknown as JobStatus[];

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
  }),
  loaderDeps: ({ search }: { search: JobSearchParams }) => search,
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async ({ deps }: { deps: JobSearchParams }) => {
    const [resume, savedSearches, cronInfo] = await Promise.all([
      getResume(),
      getSavedPipelineSearches(),
      getPipelineCronInfo(),
    ]);

    return defer({
      hasResume: !!resume?.rawText,
      fullName: resume?.fullName || null,
      savedSearches,
      cronStartHour: cronInfo.cronStartHour,
      cronFrequency: cronInfo.cronFrequency,
      jobHistory: getPipelineJobHistory({
        data: {
          ...deps,
          pageSize: PAGE_SIZE,
          excludeDiscovered: deps.analyzedOnly,
        },
      }),
    });
  },
  component: JobsPage,
});

// ─── Page component ───────────────────────────────────────────────────────────

type ViewMode = "cards" | "table";

function JobsPage() {
  const { page, query, remote, sortBy, status: activeStatus, analyzedOnly, analyze, url: searchUrl } = Route.useSearch();
  const loaderData = Route.useLoaderData() as any;
  const { hasResume, fullName, savedSearches: loaderSavedSearches, cronStartHour, cronFrequency, jobHistory } = loaderData;
  const navigate = Route.useNavigate();

  const [activeTab, setActiveTab] = useState("pipeline");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aggregatedSearchOpen, setAggregatedSearchOpen] = useState(false);
  const [aggregatedResults, setAggregatedResults] = useState<any>(null);
  const [savedAggregatedJobIds, setSavedAggregatedJobIds] = useState<Set<string>>(new Set());
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [cronNewCount, setCronNewCount] = useState(0);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<HubJob | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<any>(null);

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Caliber"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="Your High-Caliber Job Pipeline"
        description={
          loaderData.canViewAllUsers
            ? "Browse all users' agent jobs and manage the full pipeline."
            : "Deploy background agents to search LinkedIn, Greenhouse, Lever, and Workable on your schedule — surfacing only top-tier matches."
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white hover:border-slate-300"
            >
              <BarChart3 className="h-4 w-4" />
              Insights
            </Link>
            <button
              type="button"
              onClick={() => {
                setSelectedJobForAnalysis(null);
                setStoredAnalysis(null);
                setAnalysisModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 border border-indigo-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <Search className="h-4 w-4" />
              Analyze
            </button>
            <button
              type="button"
              onClick={() => setAggregatedSearchOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 border border-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
            >
              <Sparkles className="h-4 w-4" />
              Quick Search
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 border border-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              <BookMarked className="h-4 w-4" />
              Agents
              {loaderSavedSearches.length > 0 && (
                <span className="rounded-full bg-white/30 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {loaderSavedSearches.length}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* Tab Navigation - Simple Implementation */}
      <div className="px-4 md:px-6">
        <div className="flex gap-2 border-b mb-6">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === "pipeline"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <BookMarked className="h-4 w-4" />
            Pipeline
            {cronNewCount > 0 && (
              <span className="ml-2 rounded-full bg-green-500 text-white text-xs font-bold px-2 py-0.5">
                +{cronNewCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("quick-search")}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === "quick-search"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Quick Search
          </button>
        </div>

        {/* Pipeline Tab */}
        {activeTab === "pipeline" && (
          <Suspense fallback={<JobsListSkeleton />}>
            <JobsListContentWrapper
              jobHistoryPromise={jobHistory}
              hasResume={hasResume}
              fullName={fullName}
              savedSearches={loaderSavedSearches}
              cronStartHour={cronStartHour}
              cronFrequency={cronFrequency}
              canViewAllUsers={loaderData.canViewAllUsers}
            />
          </Suspense>
        )}

        {/* Quick Search Tab */}
        {activeTab === "quick-search" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-blue-900 mb-1">Quick Job Search</h3>
              <p className="text-sm text-blue-800">
                Search across Adzuna, Jooble, and Remotive simultaneously. Results are cached for 1 hour.
              </p>
            </div>

            {aggregatedResults ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {aggregatedResults.jobs.length} jobs found
                  </h3>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAggregatedResults(null);
                      setAggregatedSearchOpen(true);
                    }}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    New Search
                  </Button>
                </div>
                <AggregatedJobsResults
                  jobs={aggregatedResults.jobs}
                  onSaveJob={async (job) => {
                    setSavedAggregatedJobIds((prev) =>
                      new Set([...prev, `${job.source}-${job.id}`])
                    );
                    // Optional: save to database
                    try {
                      await fetch('/api/saved-jobs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(job),
                      });
                    } catch (error) {
                      console.error('Failed to save job:', error);
                    }
                  }}
                  onAnalyzeJob={async (job) => {
                    setSelectedJobForAnalysis({
                      title: job.title,
                      company: job.company,
                      sourceUrl: job.jobUrl,
                    } as any);
                    setAnalysisModalOpen(true);
                  }}
                  savedJobIds={savedAggregatedJobIds}
                />
              </div>
            ) : (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  No search results yet. Click the Quick Search button to get started.
                </p>
                <Button onClick={() => setAggregatedSearchOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Search
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

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
        pipelineJobId={selectedJobForAnalysis?.id}
        onAnalysisComplete={() => {}}
        onDocumentGenerated={() => {}}
      />

      <EnhancedJobSearch
        open={aggregatedSearchOpen}
        onOpenChange={setAggregatedSearchOpen}
        onSearchComplete={(result) => {
          setAggregatedResults(result);
          setAggregatedSearchOpen(false);
          setActiveTab("quick-search");
        }}
      />

      <AgentsSearchDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        hasResume={hasResume}
        fullName={fullName}
        initialSavedSearches={loaderSavedSearches}
        preload={null}
        cronStartHour={cronStartHour}
        cronFrequency={cronFrequency}
        onSearchComplete={() => {}}
      />
    </div>
  );
}

// Wrapper component that awaits the deferred job history
function JobsListContentWrapper({
  jobHistoryPromise,
  hasResume,
  fullName,
  savedSearches: loaderSavedSearches,
  cronStartHour,
  cronFrequency,
  canViewAllUsers,
}: {
  jobHistoryPromise: Promise<any>;
  hasResume: boolean;
  fullName: string | null;
  savedSearches: any[];
  cronStartHour: number;
  cronFrequency: string;
  canViewAllUsers: boolean;
}): React.ReactElement {
  const { page, query, remote, sortBy, status: activeStatus, analyzedOnly } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [inputValue, setInputValue] = useState(query);

  return (
    <Suspense fallback={<JobsListSkeleton />}>
      <JobsListContent
        jobHistoryPromise={jobHistoryPromise}
        hasResume={hasResume}
        fullName={fullName}
        savedSearches={loaderSavedSearches}
        cronStartHour={cronStartHour}
        cronFrequency={cronFrequency}
        canViewAllUsers={canViewAllUsers}
        page={page}
        query={query}
        remote={remote}
        sortBy={sortBy}
        activeStatus={activeStatus}
        analyzedOnly={analyzedOnly}
        inputValue={inputValue}
        setInputValue={setInputValue}
        navigate={navigate}
      />
    </Suspense>
  );
}

async function JobsListContent({
  jobHistoryPromise,
  hasResume,
  fullName,
  savedSearches: loaderSavedSearches,
  cronStartHour,
  cronFrequency,
  canViewAllUsers,
  page,
  query,
  remote,
  sortBy,
  activeStatus,
  analyzedOnly,
  inputValue,
  setInputValue,
  navigate,
}: {
  jobHistoryPromise: Promise<any>;
  hasResume: boolean;
  fullName: string | null;
  savedSearches: any[];
  cronStartHour: number;
  cronFrequency: string;
  canViewAllUsers: boolean;
  page: number;
  query: string;
  remote: boolean;
  sortBy: string;
  activeStatus: string;
  analyzedOnly: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  navigate: any;
}): Promise<React.ReactElement> {
  const history = await jobHistoryPromise;
  const rows = history.rows;
  const total = history.total;
  const statusCounts = history.statusCounts;

  const searchParams = { page, query, remote, sortBy, status: activeStatus, analyzedOnly };
  const jobsQuery = useJobsQuery({ searchParams });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<"archive" | "delete" | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const didMount = useRef(false);

  const jobs = (jobsQuery.data?.rows ?? rows) as HubJob[];
  const localTotal = jobsQuery.data?.total ?? total;
  const currentStatusCounts = jobsQuery.data?.statusCounts ?? statusCounts;

  const totalPages = Math.ceil(localTotal / PAGE_SIZE);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = jobs.length > 0 && jobs.every((job) => selectedIds.has(job.id));
  const hasActiveFilters = !!(query || remote || activeStatus || analyzedOnly);

  const pipeline = useMemo(
    () =>
      JOB_STATUSES.map((status) => ({
        status,
        count: Number(currentStatusCounts?.[status] ?? 0),
        percent: localTotal > 0 ? Math.round((Number(currentStatusCounts?.[status] ?? 0) / localTotal) * 100) : 0,
      })),
    [localTotal, currentStatusCounts],
  );

  const sortedJobs = useMemo(() => {
    const jobsCopy = [...jobs];
    switch (sortBy) {
      case "title":
        return jobsCopy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      case "score":
        return jobsCopy.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      case "company":
        return jobsCopy.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
      case "location":
        return jobsCopy.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
      case "posted-date":
      default:
        return jobsCopy.sort((a, b) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime());
    }
  }, [jobs, sortBy]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, query, remote, sortBy, activeStatus, analyzedOnly]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (inputValue.trim() !== query) {
        navigate({ search: (prev) => ({ ...prev, query: inputValue.trim(), page: 1 }) });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [inputValue, navigate, query]);

  useEffect(() => {
    if (analyze || searchUrl) {
      // Clear parameters from the URL
      navigate({
        search: (prev) => {
          const next = { ...prev };
          delete (next as any).analyze;
          delete (next as any).url;
          return next;
        },
        replace: true,
      });

      setSelectedJobForAnalysis(null);
      setStoredAnalysis(null);
      if (searchUrl) {
        setSelectedJobForAnalysis({
          title: "New Job Analysis",
          company: "",
          sourceUrl: searchUrl,
        } as any);
      }
      setAnalysisModalOpen(true);
    }
  }, [analyze, searchUrl, navigate]);

  useEffect(() => {
    const hasActiveCron = loaderSavedSearches.some((s) => s.isActive);
    if (!hasActiveCron) return;

    const interval = setInterval(async () => {
      try {
        const check = await getPipelineJobHistory({ data: { page: 1, pageSize: 1 } });
        if (check.total > localTotal) {
          setCronNewCount(check.total - localTotal);
        }
      } catch {
        // ignore polling errors silently
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [loaderSavedSearches, localTotal]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handlePageChange(newPage: number) {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const job of jobs) next.delete(job.id);
      } else {
        for (const job of jobs) next.add(job.id);
      }
      return next;
    });
  }

  async function handleStatusChange(id: number, status: JobStatus) {
    setPendingStatusId(id);
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      return {
        ...data,
        rows: data.rows.map((job) => (job.id === id ? { ...job, status } : job)),
      };
    });
    try {
      await setPipelineJobStatus({ data: { id, status } });
      await jobsQuery.invalidateJobs();
    } catch (error) {
      jobsQuery.invalidateJobs();
      alert(error instanceof Error ? error.message : "Unable to update job status.");
    } finally {
      setPendingStatusId(null);
    }
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPendingBulkAction("archive");
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      return {
        ...data,
        rows: data.rows.map((job) => (selectedIds.has(job.id) ? { ...job, status: "Archived" as const } : job)),
      };
    });
    try {
      await archivePipelineJobs({ data: { ids } });
      setSelectedIds(new Set());
      await jobsQuery.invalidateJobs();
    } catch (error) {
      jobsQuery.invalidateJobs();
      alert(error instanceof Error ? error.message : "Unable to archive selected jobs.");
    } finally {
      setPendingBulkAction(null);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected job${ids.length === 1 ? "" : "s"}?`)) return;

    setPendingBulkAction("delete");
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      const filtered = data.rows.filter((job) => !selectedIds.has(job.id));
      const deleted = data.rows.length - filtered.length;
      return {
        ...data,
        rows: filtered,
        total: Math.max(0, data.total - deleted),
      };
    });
    try {
      const result = await deletePipelineJobs({ data: { ids } });
      const deleted = result.deleted ?? ids.length;
      const nextTotal = Math.max(0, localTotal - deleted);
      setSelectedIds(new Set());

      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > nextTotalPages) {
        await navigate({ search: (prev) => ({ ...prev, page: nextTotalPages }) });
      } else {
        await jobsQuery.invalidateJobs();
      }
    } catch (error) {
      jobsQuery.invalidateJobs();
      alert(error instanceof Error ? error.message : "Unable to delete selected jobs.");
    } finally {
      setPendingBulkAction(null);
    }
  }

  function handleSearchComplete(
    freshJobs: LinkedInScrapedJob[],
    meta: { warnings: string[]; searchUrl: string },
  ) {
    setSearchWarnings(meta.warnings);
    const existingUrls = new Set(jobs.map((j) => j.sourceUrl));
    const incoming = freshJobs
      .filter((j) => !existingUrls.has(j.sourceUrl))
      .map((j) => ({ ...j, isNew: true } as unknown as HubJob));
    if (incoming.length > 0) {
      jobsQuery.updateJobsOptimistically((data) => {
        if (!data) return data;
        return {
          ...data,
          rows: [...incoming, ...data.rows],
          total: data.total + incoming.length,
        };
      });
    }
    void jobsQuery.invalidateJobs();
  }

  function openFreshDrawer() {
    setDrawerOpen(true);
  }

  function toggleStatusFilter(status: JobStatus) {
    navigate({
      search: (prev) => ({
        ...prev,
        status: prev.status === status ? "" : status,
        page: 1,
        analyzedOnly: status === "Discovered" ? false : prev.analyzedOnly,
      }),
    });
  }

  function openAnalysisModal(job: HubJob) {
    setSelectedJobForAnalysis(job);
    setStoredAnalysis(null);

    // If job has been analyzed, extract the analysis data from the job object
    if (job.analyzedAt) {
      const analysis = {
        id: job.id,
        jobTitle: job.title,
        company: job.company,
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

  function handleAnalysisComplete(_analysis: AnalysisData) {
    if (selectedJobForAnalysis && selectedJobForAnalysis.id) {
      const id = selectedJobForAnalysis.id;
      jobsQuery.updateJobsOptimistically((data) => {
        if (!data) return data;
        return {
          ...data,
          rows: data.rows.map((job) =>
            job.id === id ? { ...job, status: "Analyzed" as const } : job
          ),
        };
      });
    }
  }

  function handleDocumentGenerated() {
    if (selectedJobForAnalysis?.id) {
      const id = selectedJobForAnalysis.id;
      jobsQuery.updateJobsOptimistically((data) => {
        if (!data) return data;
        return {
          ...data,
          rows: data.rows.map((job) =>
            job.id === id && job.status === "Analyzed"
              ? { ...job, status: "Prepped" as const }
              : job
          ),
        };
      });
      setPipelineJobStatus({ data: { id, status: "Prepped" } }).catch(() => {});
    }
  }

  function closeAnalysisModal() {
    setAnalysisModalOpen(false);
    setSelectedJobForAnalysis(null);
    setStoredAnalysis(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>

      {/* Cron new-jobs banner */}
      {cronNewCount > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <div className="flex items-center justify-between gap-4">
            <p>
              {cronNewCount} new job{cronNewCount === 1 ? "" : "s"} added by your active agents.
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCronNewCount(0);
                  void jobsQuery.invalidateJobs();
                }}
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setCronNewCount(0)}
                className="text-emerald-600 hover:text-emerald-800"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search warnings banner */}
      {searchWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {searchWarnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSearchWarnings([])}
              className="shrink-0 text-amber-600 hover:text-amber-800"
              aria-label="Dismiss warnings"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <PageSection
          title="Job Pipeline"
          description="Agent jobs are pruned daily when older than 30 days."
          actions={
            <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {hasActiveFilters
                  ? canViewAllUsers ? "Filtered Stored Jobs" : "Your Filtered Jobs"
                  : canViewAllUsers ? "Total Stored Jobs" : "Your Stored Jobs"}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {hasActiveFilters ? `${localTotal} matching` : "Currently saved"}
                </p>
                <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">
                  {localTotal}
                </div>
              </div>
            </div>
          }
        >
          {/* Pipeline counts */}
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline</p>
                <p className="text-sm text-slate-600">
                  Click a status to filter the list below.
                </p>
              </div>
              <div className="text-sm font-semibold text-slate-700">{localTotal} total</div>
            </div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {pipeline.map(({ status, count, percent }) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatusFilter(status)}
                  className={`rounded-xl border p-3 text-left transition ${
                    activeStatus === status
                      ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-slate-700">{status}</span>
                    <span className="text-xs font-bold text-slate-900">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full ${STATUS_TONES[status].bar}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{percent}%</p>
                </button>
              ))}
            </div>
          </div>

          {/* Filters + sort */}
          <div className="mb-5 space-y-3">
            {/* Search bar - full width */}
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={inputValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                placeholder="Search agent jobs by title or company"
                className="h-auto border-0 bg-transparent px-2 py-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
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
              <select
                value={sortBy}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  navigate({ search: (prev) => ({ ...prev, sortBy: e.target.value as SortOption, page: 1 }) })
                }
                className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm"
                aria-label="Sort jobs"
              >
                <option value="posted-date">Sort: Posted date</option>
                <option value="title">Sort: Job title</option>
                <option value="score">Sort: Match Score</option>
                <option value="company">Sort: Company</option>
                <option value="location">Sort: Location</option>
              </select>
              <button
                type="button"
                aria-pressed={remote}
                onClick={() => navigate({ search: (prev) => ({ ...prev, remote: !remote, page: 1 }) })}
                className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition ${
                  remote
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Remote only
              </button>
              <button
                type="button"
                aria-pressed={analyzedOnly}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      analyzedOnly: !analyzedOnly,
                      status: !analyzedOnly && prev.status === "Discovered" ? "" : prev.status,
                      page: 1,
                    }),
                  })
                }
                className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition ${
                  analyzedOnly
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Analyzed only
              </button>
              {activeStatus && (
                <button
                  type="button"
                  onClick={() => navigate({ search: (prev) => ({ ...prev, status: "", page: 1 }) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                >
                  {activeStatus}
                  <span className="text-indigo-400">×</span>
                </button>
              )}
              {jobs.length > 0 && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600"
                    aria-label="Select all visible jobs"
                  />
                  Select all
                </label>
              )}
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <PageActionBar tone="primary" className="mb-5">
              <span className="font-semibold text-slate-700">{selectedCount} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBulkArchive}
                  disabled={pendingBulkAction !== null}
                >
                  {pendingBulkAction === "archive" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Archive
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={pendingBulkAction !== null}
                >
                  {pendingBulkAction === "delete" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              </div>
            </PageActionBar>
          )}

          {/* Job cards or table */}
          {viewMode === "cards" ? (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {sortedJobs.map((job) => (
                <JobResultCard
                  key={job.id ?? job.sourceUrl}
                  job={{ ...job, resultSource: "history" }}
                  isNew={!!job.isNew}
                  selected={job.id ? selectedIds.has(job.id) : false}
                  showSelection={!!job.id}
                  onSelect={job.id ? () => toggleSelected(job.id!) : undefined}
                  statusOptions={JOB_STATUSES}
                  onStatusChange={job.id ? (status) => handleStatusChange(job.id!, status) : undefined}
                  statusPending={job.id ? pendingStatusId === job.id : false}
                  isAnalyzed={!!job.analyzedAt}
                  onAnalyzeClick={job.id ? () => openAnalysisModal(job) : undefined}
                />
              ))}
            </div>
          ) : (
            <JobTableView
              jobs={sortedJobs.map((job) => ({ ...job, resultSource: "history" }))}
              selectedIds={selectedIds}
              onSelect={(id) => toggleSelected(id)}
              onSelectAll={(checked) => {
                if (checked) {
                  const newSelected = new Set(selectedIds);
                  for (const job of jobs) {
                    if (job.id) newSelected.add(job.id);
                  }
                  setSelectedIds(newSelected);
                } else {
                  setSelectedIds(new Set());
                }
              }}
              onStatusChange={(id, status) => handleStatusChange(id, status)}
              statusOptions={JOB_STATUSES}
              statusPending={pendingStatusId}
              onAnalyze={(jobUrl) => {
                const job = jobs.find((j) => j.sourceUrl === jobUrl);
                if (job) openAnalysisModal(job);
              }}
              analyzedJobIds={new Set(jobs.filter((j) => j.analyzedAt).map((j) => j.id).filter((id): id is number => !!id))}
            />
          )}

          {jobs.length === 0 && (
            <div className="mt-6 flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-slate-500">
                {hasActiveFilters
                  ? "No agent jobs match the current filters."
                  : "No agent jobs yet. Configure an agent search to get started."}
              </p>
              {!hasActiveFilters && (
                <button
                  type="button"
                  onClick={openFreshDrawer}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 hover:text-amber-400"
                >
                  <Search className="h-4 w-4" />
                  Configure Agents
                </button>
              )}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            className="mt-8"
          />
        </PageSection>
      </div>
    </>
  );
}

// Skeleton loading component for job list streaming
function JobsListSkeleton() {
  return (
    <div className="spx-page spx-stack">
      <div className="space-y-5 animate-pulse">
        <div className="h-24 rounded-2xl bg-slate-200/70" />
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-200/70" />
          ))}
        </div>
        <div className="h-16 rounded-xl bg-slate-200/70" />
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

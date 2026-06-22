import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { toast } from "sonner";
import {
  Archive,
  BookMarked,
  Briefcase,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Globe,
  Loader2,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  Trash2,
  Sparkles,
  X,
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
  getRecommendedJobs,
  togglePipelineJobFavorite,
  getCatalogJobs,
  starCatalogJob,
  checkNewJobsSince,
} from "@/server/functions/jobs-pipeline";
import {
  PIPELINE_STATUSES,
  STATUS_TONES,
} from "@/lib/pipeline-constants";
import { useJobsQuery } from "@/hooks/useJobsQuery";
import { useCatalogQuery } from "@/hooks/useCatalogQuery";
import type { CatalogFilters } from "@/hooks/useCatalogQuery";
import { useQueryClient } from "@tanstack/react-query";
import { useVectorSearch } from "@/hooks/useVectorSearch";
import { VectorSearchBar } from "@/components/ui/vector-search-bar";

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
    const [resume, savedSearches, cronInfo, jobHistory, recommendedRes] = await Promise.all([
      getResume(),
      getSavedPipelineSearches(),
      getPipelineCronInfo(),
      getPipelineJobHistory({
        data: {
          ...deps,
          pageSize: PAGE_SIZE,
          excludeFavorited: deps.analyzedOnly,
          isFavorited: true,
        },
      }),
      deps.view === "all-jobs" ? getRecommendedJobs() : Promise.resolve({ jobs: [] }),
    ]);

    return {
      hasResume: !!resume?.rawText,
      fullName: resume?.fullName || null,
      savedSearches,
      cronStartHour: cronInfo.cronStartHour,
      cronFrequency: cronInfo.cronFrequency,
      jobHistory,
      recommendedJobs: recommendedRes.jobs,
    };
  },
  component: JobsPage,
});

// ─── Page component ───────────────────────────────────────────────────────────

type ViewMode = "cards" | "table";

function JobsPage() {
  const { page, query, remote, sortBy, status: activeStatus, analyzedOnly, analyze, url: searchUrl, view, catalogQuery } = Route.useSearch();
  const loaderData = Route.useLoaderData() as any;
  const { hasResume, fullName, savedSearches: loaderSavedSearches, cronStartHour, cronFrequency, jobHistory } = loaderData;
  const navigate = Route.useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<HubJob | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<any>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const isSearchMode = view === 'search' && catalogQuery.trim().length > 0;

  // Auto-scroll to catalog when landing in search mode
  useEffect(() => {
    if (isSearchMode && catalogRef.current) {
      setTimeout(() => {
        catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [isSearchMode, catalogQuery]);

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
            : "Deploy background agents to search LinkedIn, Greenhouse, Lever, and Workable on your schedule — surfacing only top-tier matches."
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

      <div ref={catalogRef}>
        {isSearchMode && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <Search className="h-4 w-4 text-indigo-500 shrink-0" />
            <p className="flex-1 text-sm font-medium text-indigo-800">
              Showing results for <span className="font-bold">"{catalogQuery}"</span>
            </p>
            <button
              onClick={() => navigate({ search: (prev: any) => ({ ...prev, view: 'all-jobs', catalogQuery: '' }) })}
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition shrink-0"
            >
              <X className="h-4 w-4" />
              Clear search
            </button>
          </div>
        )}
        <CatalogBrowser
          onAnalyzeClick={openAnalysisModal}
          viewMode={viewMode}
          setViewMode={setViewMode}
          recommendedJobs={loaderData.recommendedJobs}
          initialQuery={catalogQuery}
          isSearchMode={isSearchMode}
        />
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

    </div>
  );
}

// Content component for the pipeline tab
function JobsListContentWrapper({
  jobHistoryPromise,
  hasResume,
  fullName,
  savedSearches: loaderSavedSearches,
  cronStartHour,
  cronFrequency,
  canViewAllUsers,
  analysisModalOpen,
  setAnalysisModalOpen,
  selectedJobForAnalysis,
  setSelectedJobForAnalysis,
  storedAnalysis,
  setStoredAnalysis,
  searchWarnings,
  setSearchWarnings,
  drawerOpen,
  setDrawerOpen,
  aggregatedSearchOpen,
  setAggregatedSearchOpen,
  aggregatedResults,
  setAggregatedResults,
  savedAggregatedJobIds,
  setSavedAggregatedJobIds,
  viewMode,
  setViewMode,
}: {
  jobHistoryPromise: any;
  hasResume: boolean;
  fullName: string | null;
  savedSearches: any[];
  cronStartHour: number;
  cronFrequency: string;
  canViewAllUsers: boolean;
  analysisModalOpen: boolean;
  setAnalysisModalOpen: (open: boolean) => void;
  selectedJobForAnalysis: any;
  setSelectedJobForAnalysis: (job: any) => void;
  storedAnalysis: any;
  setStoredAnalysis: (analysis: any) => void;
  searchWarnings: string[];
  setSearchWarnings: (warnings: string[]) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  aggregatedSearchOpen: boolean;
  setAggregatedSearchOpen: (open: boolean) => void;
  aggregatedResults: any;
  setAggregatedResults: (results: any) => void;
  savedAggregatedJobIds: Set<string>;
  setSavedAggregatedJobIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}): React.ReactElement {
  const { page, query, remote, sortBy, status: activeStatus, analyzedOnly, analyze, url: searchUrl, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const rows = jobHistoryPromise.rows;
  const total = jobHistoryPromise.total;
  const statusCounts = jobHistoryPromise.statusCounts;

  const searchParams = { page, query, remote, sortBy, status: activeStatus, analyzedOnly, view, catalogQuery: '' };
  const jobsQuery = useJobsQuery({ searchParams });

  const [inputValue, setInputValue] = useState(query);
  const [debouncedQuery] = useDebouncedValue(inputValue, { wait: 350 });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<"archive" | "delete" | null>(null);

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
    if (debouncedQuery.trim() !== query) {
      navigate({ search: (prev) => ({ ...prev, query: debouncedQuery.trim(), page: 1 }) });
    }
  }, [debouncedQuery, navigate, query]);

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
    const lastCheckRef = { current: new Date().toISOString() };

    const interval = setInterval(async () => {
      try {
        const checkTime = new Date().toISOString();
        const res = await checkNewJobsSince({ data: { since: lastCheckRef.current } });
        
        lastCheckRef.current = checkTime;

        if (res.crawlerJobsCount > 0 && res.agentJobsCount > 0) {
          toast.success(
            `${res.crawlerJobsCount} crawler job${res.crawlerJobsCount === 1 ? "" : "s"} + ${res.agentJobsCount} agent job${res.agentJobsCount === 1 ? "" : "s"} added to All Jobs`,
            { duration: 6000 }
          );
        } else if (res.crawlerJobsCount > 0) {
          toast.success(
            `${res.crawlerJobsCount} new job${res.crawlerJobsCount === 1 ? "" : "s"} added to All Jobs by background crawler`,
            { duration: 6000 }
          );
        } else if (res.agentJobsCount > 0) {
          toast.success(
            `${res.agentJobsCount} new job${res.agentJobsCount === 1 ? "" : "s"} added to All Jobs by your search agents`,
            { duration: 6000 }
          );
        }
      } catch (error) {
        // ignore polling errors
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

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

  async function handleToggleFavorite(id: number, isFavorited: boolean) {
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      const targetedJob = data.rows.find((j) => j.id === id);
      const isFavoritedStage = targetedJob?.status === "Favorited";
      
      const filteredRows = data.rows
        .map((job) => {
          if (job.id === id) {
            const nextStatus = isFavorited ? "Favorited" as const : job.status;
            return { ...job, isFavorited, status: nextStatus };
          }
          return job;
        })
        .filter((job) => {
          if (job.id === id && !isFavorited && job.status === "Favorited") {
            return false;
          }
          return true;
        });

      const nextTotal = Math.max(0, data.total - ( (!isFavorited && isFavoritedStage) ? 1 : 0 ));

      return {
        ...data,
        rows: filteredRows,
        total: nextTotal,
      };
    });
    try {
      await togglePipelineJobFavorite({ data: { id, isFavorited } });
      await jobsQuery.invalidateJobs();
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch (error) {
      jobsQuery.invalidateJobs();
      alert(error instanceof Error ? error.message : "Unable to update favorite status.");
    }
  }

  async function handleStatusChange(id: number, status: JobStatus) {
    setPendingStatusId(id);
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      if (status === "Archived") {
        const filtered = data.rows.filter((job) => job.id !== id);
        return {
          ...data,
          rows: filtered,
          total: Math.max(0, data.total - 1),
        };
      }
      return {
        ...data,
        rows: data.rows.map((job) => (job.id === id ? { ...job, status, isFavorited: status === "Favorited" ? true : job.isFavorited } : job)),
      };
    });
    try {
      await setPipelineJobStatus({ data: { id, status } });
      await jobsQuery.invalidateJobs();
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
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
      const filtered = data.rows.filter((job) => job.id && !selectedIds.has(job.id));
      const archivedCount = data.rows.length - filtered.length;
      return {
        ...data,
        rows: filtered,
        total: Math.max(0, data.total - archivedCount),
      };
    });
    try {
      await archivePipelineJobs({ data: { ids } });
      setSelectedIds(new Set());
      await jobsQuery.invalidateJobs();
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
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

  function openFreshDrawer() {
    setDrawerOpen(true);
  }

  function toggleStatusFilter(status: JobStatus) {
    navigate({
      search: (prev) => ({
        ...prev,
        status: prev.status === status ? "" : status,
        page: 1,
        analyzedOnly: status === "Favorited" ? false : prev.analyzedOnly,
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
          {/* Pipeline status tiles — one card, grid of clickable tiles */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
              {pipeline.map(({ status, count, percent }) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatusFilter(status)}
                  className={`p-3 text-left transition hover:bg-orange-50/40 focus:outline-none ${
                    activeStatus === status ? "bg-orange-50 border-b-2 border-orange-500" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-slate-600 truncate">{status}</span>
                    <span className="text-sm font-bold text-slate-900">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${STATUS_TONES[status].bar}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
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
                      status: !analyzedOnly && prev.status === "Favorited" ? "" : prev.status,
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
                  isFavorited={job.isFavorited === true || job.isFavorited === 1 || job.status === "Favorited"}
                  onToggleFavorite={job.id ? () => handleToggleFavorite(job.id!, !(job.isFavorited === true || job.isFavorited === 1 || job.status === "Favorited")) : undefined}
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

// ─── Catalog Browser ──────────────────────────────────────────────────────────

// ─── Catalog Browser (TanStack Query + Pacer) ─────────────────────────────────

const ATS_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'workable', label: 'Workable' },
  { value: 'ashby', label: 'Ashby' },
];

const SALARY_OPTIONS = [
  { value: 0, label: 'Any salary' },
  { value: 50000, label: '$50K+' },
  { value: 75000, label: '$75K+' },
  { value: 100000, label: '$100K+' },
  { value: 125000, label: '$125K+' },
  { value: 150000, label: '$150K+' },
  { value: 200000, label: '$200K+' },
];

const atsBadgeClass: Record<string, string> = {
  greenhouse: 'bg-emerald-100 text-emerald-700',
  lever: 'bg-indigo-100 text-indigo-700',
  workable: 'bg-sky-100 text-sky-700',
  ashby: 'bg-violet-100 text-violet-700',
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
  initialQuery = '',
  isSearchMode = false,
}: {
  onAnalyzeClick: (job: any) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  recommendedJobs: any[];
  initialQuery?: string;
  isSearchMode?: boolean;
}) {
  // Local filter state — text inputs are debounced inside useCatalogQuery via @tanstack/react-pacer
  const [filters, setFilters] = useState<CatalogFilters>({
    query: initialQuery,
    remote: undefined,
    company: '',
    ats: '',
    salaryMin: 0,
    page: 1,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    data,
    isFetching,
    isLoading,
    starMutation,
    prefetchPage,
    totalPages,
    isDebouncing,
  } = useCatalogQuery(filters);

  // Sync filter query when initialQuery changes (e.g. new search from header)
  useEffect(() => {
    setFilters((prev) => ({ ...prev, query: initialQuery, page: 1 }));
  }, [initialQuery]);

  const hasActiveFilters =
    filters.remote !== undefined || filters.company || filters.ats || filters.salaryMin > 0;

  const setFilter = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: key !== 'page' ? 1 : prev.page }));
  };

  const clearFilters = () =>
    setFilters((prev) => ({ ...prev, remote: undefined, company: '', ats: '', salaryMin: 0, page: 1 }));

  const handlePageChange = (p: number) => {
    setFilter('page', p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStar = (job: any) => {
    starMutation.mutate({ canonicalJobId: job.id, star: !job.isFavorited });
  };

  const spinning = isFetching || isDebouncing;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Job Catalog</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {data
              ? `${data.total.toLocaleString()} jobs · ⭐ star any job to add it to My Jobs`
              : 'Loading catalog…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

          <button
            onClick={() => setFiltersOpen((o) => !o)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
            filtersOpen || hasActiveFilters
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {isSearchMode ? 'Refine Results' : 'Filters'}
          {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-amber-400" />}
        </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          placeholder="Search jobs by title, skills, or keywords…"
          className="w-full pl-10 pr-36 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
        {filters.query && !spinning && (
          <button
            onClick={() => setFilter('query', '')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 hover:text-slate-700 transition"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {spinning ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 animate-spin" />
        ) : !filters.query && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-indigo-400 pointer-events-none select-none">✦ AI</span>
        )}
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Work type */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Work Type</label>
              <div className="flex gap-1.5">
                {([{ label: 'Any', val: undefined }, { label: 'Remote', val: true }, { label: 'On-site', val: false }] as const).map(({ label, val }) => (
                  <button
                    key={label}
                    onClick={() => setFilter('remote', val as boolean | undefined)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition ${
                      filters.remote === val
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Company</label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={filters.company}
                  onChange={(e) => setFilter('company', e.target.value)}
                  placeholder="e.g. Stripe"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* ATS Source */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">ATS Source</label>
              <select
                value={filters.ats}
                onChange={(e) => setFilter('ats', e.target.value)}
                className="w-full py-1.5 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ATS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Salary */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Min Salary</label>
              <select
                value={filters.salaryMin}
                onChange={(e) => setFilter('salaryMin', Number(e.target.value))}
                className="w-full py-1.5 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SALARY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end">
              <button onClick={clearFilters} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition">
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

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
                  onAnalyzeClick={async () => {
                    if (!job.isSaved && !job.isFavorited) {
                      await starMutation.mutateAsync({ canonicalJobId: job.canonicalJobId || String(job.id), star: true });
                    }
                    onAnalyzeClick({
                      ...job,
                      title: job.jobTitle || job.title,
                      company: job.employerName || job.company,
                      sourceUrl: job.sourceUrl,
                    });
                  }}
                  onApplyClick={async () => {
                    if (!job.isSaved && !job.isFavorited) {
                      await starMutation.mutateAsync({ canonicalJobId: job.canonicalJobId || String(job.id), star: true });
                    }
                  }}
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
                    onAnalyzeClick={async () => {
                      if (!job.isSaved || !job.isFavorited) {
                        await starMutation.mutateAsync({ canonicalJobId: job.id, star: true });
                      }
                      onAnalyzeClick({
                        ...job,
                        title: job.titleDisplay,
                        company: job.companyDisplay,
                        sourceUrl: job.applyUrl ?? job.sourceUrl,
                      });
                    }}
                    isFavorited={job.isFavorited}
                    onToggleFavorite={() => handleStar(job)}
                    onApplyClick={async () => {
                      if (!job.isSaved || !job.isFavorited) {
                        await starMutation.mutateAsync({ canonicalJobId: job.id, star: true });
                      }
                    }}
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
                      title={job.isFavorited ? 'Remove from My Jobs' : 'Star to add to My Jobs'}
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
                          onClick={async () => {
                            if (!job.isSaved || !job.isFavorited) {
                              await starMutation.mutateAsync({ canonicalJobId: job.id, star: true });
                            }
                          }}
                          className="px-2.5 py-1 text-[12px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                        >
                          Apply
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          if (!job.isSaved || !job.isFavorited) {
                            await starMutation.mutateAsync({ canonicalJobId: job.id, star: true });
                          }
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
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-3 px-4 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition">
              Clear all filters
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

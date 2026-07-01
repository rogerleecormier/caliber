import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  Grid3x3,
  Loader2,
  Search,
  Star,
  Table2,
} from "lucide-react";
import {
  PageHero,
  PageSection,
  Pagination,
} from "@caliber/ui-kit";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import {
  JobResultCard,
  type JobStatus,
} from "@/components/features/job-result-card";
import { AnalysisModal } from "@/components/features/analysis-modal";
import { JobTableView } from "@/components/features/job-table-view";
import {
  getPipelineJobHistory,
  setPipelineJobStatus,
  togglePipelineJobFavorite,
} from "@/server/functions/jobs-pipeline";
import {
  PIPELINE_STATUSES,
  STATUS_TO_KEY,
  STATUS_TONES,
  type PipelineStatus,
} from "@/lib/pipeline-constants";
import { useJobsQuery } from "@/hooks/useJobsQuery";
import { useQueryClient } from "@tanstack/react-query";
import { CompactStatTile, StatCardGrid } from "@/components/ui/compact-stat-card";

type SortOption = "posted-date" | "title" | "score" | "company" | "location";

type MyJobsSearchInput = {
  page?: number;
  query?: string;
  sortBy?: SortOption;
  status?: string;
  favorites?: boolean;
};

export type MyJobsSearchParams = {
  page: number;
  query: string;
  sortBy: SortOption;
  status: string;
  favorites: boolean;
};

type HubJob = Awaited<ReturnType<typeof getPipelineJobHistory>>["rows"][number] & {
  isNew?: boolean;
};

const PAGE_SIZE = 20;
const VALID_SORT_OPTIONS: SortOption[] = ["posted-date", "title", "score", "company", "location"];
// "Not Started" is not a manually-selectable stage — it's the default for jobs that
// haven't progressed yet. Favoriting is handled separately via the star icon.
const JOB_STATUSES = PIPELINE_STATUSES.filter((s) => s !== "Not Started") as unknown as JobStatus[];
// Archived jobs are excluded from the My Jobs query entirely, so omit that stage from the pipeline filter row.
const VISIBLE_PIPELINE_STATUSES = PIPELINE_STATUSES.filter((s) => s !== "Archived" && s !== "Not Started");

export const Route = createFileRoute("/my-jobs")({
  validateSearch: (search: Record<string, unknown> & MyJobsSearchInput): MyJobsSearchParams => ({
    page: Math.max(1, Number(search.page) || 1),
    query: String(search.query ?? ""),
    sortBy: (VALID_SORT_OPTIONS.includes(search.sortBy as SortOption)
      ? search.sortBy
      : "posted-date") as SortOption,
    status: typeof search.status === "string" ? search.status : "",
    favorites: search.favorites === true,
  }),
  loaderDeps: ({ search }: { search: MyJobsSearchParams }) => search,
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async ({ deps }: { deps: MyJobsSearchParams }) => {
    const jobHistory = await getPipelineJobHistory({
      data: {
        ...deps,
        pageSize: PAGE_SIZE,
        isFavorited: true,
        favoritedOnly: deps.favorites,
      },
    });
    return { jobHistory };
  },
  component: MyJobsPage,
});

type ViewMode = "cards" | "table";

function MyJobsPage() {
  const { page, query, sortBy, status, favorites } = Route.useSearch();
  const loaderData = Route.useLoaderData() as any;
  const navigate = Route.useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<HubJob | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<any>(null);
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const searchParams = {
    page,
    query,
    sortBy,
    status,
    remote: false,
    analyzedOnly: false,
    view: "my-jobs" as const,
    catalogQuery: "",
    favoritedOnly: favorites,
  };

  const jobsQuery = useJobsQuery({ searchParams, initialData: loaderData.jobHistory });
  const jobs = (jobsQuery.data?.rows ?? []) as HubJob[];
  const totalCount = jobsQuery.data?.total ?? 0;
  const isLoading = jobsQuery.isLoading;
  const pipelineCounts = jobsQuery.data?.pipelineCounts;

  function handlePipelineFilterClick(pipelineStatus: PipelineStatus) {
    navigate({
      search: (prev) => ({
        ...prev,
        status: prev.status === pipelineStatus ? "" : pipelineStatus,
        page: 1,
      }),
    });
  }

  function handleFavoritesFilterClick() {
    navigate({
      search: (prev) => ({
        ...prev,
        favorites: !prev.favorites,
        page: 1,
      }),
    });
  }

  const sortedJobs = useMemo(() => {
    const copy = [...jobs];
    switch (sortBy) {
      case "title": return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      case "score": return copy.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      case "company": return copy.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
      case "location": return copy.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
      default: return copy.sort((a, b) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime());
    }
  }, [jobs, sortBy]);

  const analyzedJobIds = useMemo(
    () => new Set(jobs.filter((j) => j.analyzedAt).map((j) => j.id).filter((id): id is number => !!id)),
    [jobs],
  );

  async function handleStatusChange(id: number, status: JobStatus) {
    setPendingStatusId(id);
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      return {
        ...data,
        rows: data.rows.map((job) => (job.id === id ? { ...job, currentStage: status as any } : job)),
      };
    });
    try {
      await setPipelineJobStatus({ data: { id, status: status as any } });
      await jobsQuery.invalidateJobs();
    } catch {
      toast.error("Failed to update job status");
      jobsQuery.invalidateJobs();
    } finally {
      setPendingStatusId(null);
    }
  }

  async function handleToggleFavorite(id: number, nextFavorited: boolean) {
    jobsQuery.updateJobsOptimistically((data) => {
      if (!data) return data;
      return {
        ...data,
        rows: data.rows.map((job) => (job.id === id ? { ...job, isFavorited: nextFavorited } : job)),
      };
    });
    try {
      await togglePipelineJobFavorite({ data: { id, isFavorited: nextFavorited } });
      await jobsQuery.invalidateJobs();
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error("Failed to update favorite status");
      jobsQuery.invalidateJobs();
    }
  }

  function openAnalysisModal(job: HubJob) {
    setSelectedJobForAnalysis(job);
    setStoredAnalysis(null);

    if (job.analyzedAt || job.currentStage === "Analyzed") {
      setStoredAnalysis({
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
      });
    }

    setAnalysisModalOpen(true);
  }

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Your Pipeline"
        icon={<BookMarked className="h-3.5 w-3.5" />}
        title="My Jobs"
        description="Manage and track your saved and favorited jobs."
      />

      {/* Favorites + pipeline status filter cards */}
      <StatCardGrid cols={4} className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <CompactStatTile
          key="favorited"
          icon={<Star className={`h-3.5 w-3.5 ${favorites ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />}
          label="Favorites"
          value={jobsQuery.data?.favoritedCount ?? 0}
          onClick={handleFavoritesFilterClick}
          accentClass={favorites ? "bg-amber-50 text-amber-700" : undefined}
        />
        {VISIBLE_PIPELINE_STATUSES.map((pipelineStatus) => {
          const tone = STATUS_TONES[pipelineStatus];
          const count = pipelineCounts?.[STATUS_TO_KEY[pipelineStatus]] ?? 0;
          const isActive = status === pipelineStatus;
          return (
            <CompactStatTile
              key={pipelineStatus}
              icon={<span className={`block h-2.5 w-2.5 rounded-full ${tone.dot}`} />}
              label={pipelineStatus}
              value={count}
              onClick={() => handlePipelineFilterClick(pipelineStatus)}
              accentClass={isActive ? `${tone.bg} ${tone.text}` : undefined}
            />
          );
        })}
      </StatCardGrid>

      {/* Search + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 flex-1 min-w-[200px] items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              navigate({ search: (prev) => ({ ...prev, query: e.target.value, page: 1 }) })
            }
            placeholder="Search saved jobs..."
            className="h-auto flex-1 border-0 bg-transparent px-2 py-0 shadow-none outline-none focus:ring-0"
          />
        </div>

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
      </div>

      <PageSection>
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="text-center py-12">
            <BookMarked className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No saved jobs yet</h3>
            <p className="text-slate-600">Star your favorite jobs from All Jobs to see them here.</p>
          </div>
        ) : viewMode === "cards" ? (
          <>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {sortedJobs.map((job) => (
                <JobResultCard
                  key={job.id ?? job.sourceUrl}
                  job={{ ...job, resultSource: "history" } as any}
                  isNew={!!job.isNew}
                  showSelection={false}
                  statusOptions={JOB_STATUSES}
                  onStatusChange={job.id ? (status) => handleStatusChange(job.id!, status) : undefined}
                  statusPending={job.id ? pendingStatusId === job.id : false}
                  isAnalyzed={!!job.analyzedAt}
                  onAnalyzeClick={job.id ? () => openAnalysisModal(job) : undefined}
                  isFavorited={!!job.isFavorited}
                  onToggleFavorite={job.id ? () => handleToggleFavorite(job.id!, !job.isFavorited) : undefined}
                />
              ))}
            </div>
            {totalCount > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={Math.ceil(totalCount / PAGE_SIZE)}
                onPageChange={(newPage) =>
                  navigate({ search: (prev) => ({ ...prev, page: newPage }) })
                }
                className="mt-8"
              />
            )}
          </>
        ) : (
          <>
            <JobTableView
              jobs={sortedJobs.map((job) => ({ ...job, resultSource: "history" } as any))}
              selectedIds={new Set<number>()}
              onSelect={() => {}}
              onSelectAll={() => {}}
              onStatusChange={(id, status) => handleStatusChange(id, status)}
              statusOptions={JOB_STATUSES}
              statusPending={pendingStatusId}
              onAnalyze={(jobUrl) => {
                const job = sortedJobs.find((j) => j.sourceUrl === jobUrl);
                if (job) openAnalysisModal(job);
              }}
              analyzedJobIds={analyzedJobIds}
            />
            {totalCount > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={Math.ceil(totalCount / PAGE_SIZE)}
                onPageChange={(newPage) =>
                  navigate({ search: (prev) => ({ ...prev, page: newPage }) })
                }
                className="mt-8"
              />
            )}
          </>
        )}
      </PageSection>

      {analysisModalOpen && selectedJobForAnalysis && (
        <AnalysisModal
          isOpen={analysisModalOpen}
          jobTitle={selectedJobForAnalysis.title}
          jobUrl={selectedJobForAnalysis.sourceUrl}
          onClose={() => {
            setAnalysisModalOpen(false);
            setSelectedJobForAnalysis(null);
            setStoredAnalysis(null);
          }}
          isFromExistingJob={true}
          storedAnalysis={storedAnalysis}
          pipelineJobId={selectedJobForAnalysis.id}
          onAnalysisComplete={() => {
            void jobsQuery.invalidateJobs();
          }}
          onDocumentGenerated={() => {}}
        />
      )}
    </div>
  );
}

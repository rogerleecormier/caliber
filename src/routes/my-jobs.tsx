import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { AnalysisModal } from "@/components/features/analysis-modal";
import type { AnalysisData } from "@/components/features/analysis-form";
import { JobTableView } from "@/components/features/job-table-view";
import {
  getPipelineJobHistory,
  setPipelineJobStatus,
  togglePipelineJobFavorite,
} from "@/server/functions/jobs-pipeline";
import {
  PIPELINE_STATUSES,
  STATUS_TONES,
} from "@/lib/pipeline-constants";
import { useJobsQuery } from "@/hooks/useJobsQuery";
import type { CatalogFilters } from "@/hooks/useCatalogQuery";
import { useQueryClient } from "@tanstack/react-query";

type SortOption = "posted-date" | "title" | "score" | "company" | "location";

type MyJobsSearchInput = {
  page?: number;
  query?: string;
  sortBy?: SortOption;
  status?: string;
};

export type MyJobsSearchParams = {
  page: number;
  query: string;
  sortBy: SortOption;
  status: string;
};

type HubJob = Awaited<ReturnType<typeof getPipelineJobHistory>>["rows"][number] & {
  isNew?: boolean;
};

const PAGE_SIZE = 20;
const VALID_SORT_OPTIONS: SortOption[] = ["posted-date", "title", "score", "company", "location"];
const JOB_STATUSES = PIPELINE_STATUSES as unknown as JobStatus[];

export const Route = createFileRoute("/my-jobs")({
  validateSearch: (search: Record<string, unknown> & MyJobsSearchInput): MyJobsSearchParams => ({
    page: Math.max(1, Number(search.page) || 1),
    query: String(search.query ?? ""),
    sortBy: (VALID_SORT_OPTIONS.includes(search.sortBy as SortOption)
      ? search.sortBy
      : "posted-date") as SortOption,
    status: typeof search.status === "string" ? search.status : "",
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
      },
    });

    return {
      jobHistory,
    };
  },
  component: MyJobsPage,
});

type ViewMode = "cards" | "table";

function MyJobsPage() {
  const { page, query, sortBy, status: activeStatus } = Route.useSearch();
  const loaderData = Route.useLoaderData() as any;
  const { jobHistory } = loaderData;
  const navigate = Route.useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<HubJob | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<any>(null);

  const queryClient = useQueryClient();

  const searchParams = {
    page,
    query,
    sortBy,
    status: activeStatus,
    isFavorited: true,
    pageSize: PAGE_SIZE,
  };

  const jobsQuery = useJobsQuery(searchParams);
  const { data: jobs, isLoading } = jobsQuery;

  const handleStatusChange = async (jobId: string, newStatus: JobStatus) => {
    try {
      await setPipelineJobStatus({
        data: { jobId, status: newStatus },
      });
      toast.success(`Job status updated to ${newStatus}`);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      toast.error("Failed to update job status");
    }
  };

  const handleFavoriteToggle = async (jobId: string, isFavorited: boolean) => {
    try {
      await togglePipelineJobFavorite({
        data: { jobId, isFavorited: !isFavorited },
      });
      toast.success(isFavorited ? "Removed from favorites" : "Added to favorites");
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      toast.error("Failed to update favorite status");
    }
  };

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
        eyebrow="Your Pipeline"
        icon={<BookMarked className="h-3.5 w-3.5" />}
        title="My Jobs"
        description="Manage and track your saved and favorited jobs."
      />

      {/* Search and Filters */}
      <PageActionBar>
        <Input
          type="search"
          placeholder="Search jobs..."
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            navigate({ search: (prev) => ({ ...prev, query: e.target.value, page: 1 }) })
          }
          prefix={<Search className="h-4 w-4" />}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "cards" ? "table" : "cards")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white hover:border-slate-300"
          >
            {viewMode === "cards" ? (
              <>
                <Table2 className="h-4 w-4" />
                Table
              </>
            ) : (
              <>
                <Grid3x3 className="h-4 w-4" />
                Cards
              </>
            )}
          </button>
        </div>
      </PageActionBar>

      {/* Jobs Display */}
      <PageSection>
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : !jobs || jobs.rows.length === 0 ? (
          <div className="text-center py-12">
            <BookMarked className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No saved jobs yet</h3>
            <p className="text-slate-600">Star your favorite jobs from All Jobs to see them here.</p>
          </div>
        ) : (
          <>
            {viewMode === "cards" ? (
              <div className="grid grid-cols-1 gap-4">
                {jobs.rows.map((job: HubJob) => (
                  <JobResultCard
                    key={job.id}
                    job={job}
                    onViewAnalysis={() => openAnalysisModal(job)}
                    onStatusChange={(status) => handleStatusChange(job.id, status)}
                    onFavoriteToggle={(isFavorited) => handleFavoriteToggle(job.id, isFavorited)}
                    selectedStatus={job.currentStage}
                  />
                ))}
              </div>
            ) : (
              <JobTableView
                jobs={jobs.rows}
                onViewAnalysis={(job) => openAnalysisModal(job)}
                onStatusChange={(jobId, status) => handleStatusChange(jobId, status)}
                onFavoriteToggle={(jobId, isFavorited) => handleFavoriteToggle(jobId, isFavorited)}
              />
            )}

            {jobs.totalCount > PAGE_SIZE && (
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={jobs.totalCount}
                onChange={(newPage) =>
                  navigate({ search: (prev) => ({ ...prev, page: newPage }) })
                }
              />
            )}
          </>
        )}
      </PageSection>

      {analysisModalOpen && (
        <AnalysisModal
          open={analysisModalOpen}
          onOpenChange={setAnalysisModalOpen}
          selectedJob={selectedJobForAnalysis}
          storedAnalysis={storedAnalysis}
          onSave={async (analysis: AnalysisData) => {
            await queryClient.invalidateQueries({ queryKey: ["jobs"] });
            setAnalysisModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

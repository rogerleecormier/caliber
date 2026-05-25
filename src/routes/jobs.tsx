import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookMarked,
  Briefcase,
  Loader2,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
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
  LinkedinResultCard,
  type LinkedinJobStatus,
} from "@/components/features/linkedin-result-card";
import { LinkedinSearchDrawer } from "@/components/features/linkedin-search-drawer";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = "posted-date" | "title" | "score" | "company" | "location";

type JobSearchInput = {
  page?: number;
  query?: string;
  remote?: boolean;
  green?: boolean;
  sortBy?: SortOption;
  status?: string;
  analyzedOnly?: boolean;
};

type JobSearchParams = {
  page: number;
  query: string;
  remote: boolean;
  green: boolean;
  sortBy: SortOption;
  status: string;
  analyzedOnly: boolean;
};

type HubJob = Awaited<ReturnType<typeof getPipelineJobHistory>>["rows"][number] & {
  isNew?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VALID_SORT_OPTIONS: SortOption[] = ["posted-date", "title", "score", "company", "location"];
const JOB_STATUSES = PIPELINE_STATUSES as unknown as LinkedinJobStatus[];

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/jobs")({
  validateSearch: (search: Record<string, unknown> & JobSearchInput): JobSearchParams => ({
    page: Math.max(1, Number(search.page) || 1),
    query: String(search.query ?? ""),
    remote: search.remote === true || search.remote === "true",
    green: search.green === true || search.green === "true",
    sortBy: (VALID_SORT_OPTIONS.includes(search.sortBy as SortOption)
      ? search.sortBy
      : "posted-date") as SortOption,
    status: typeof search.status === "string" ? search.status : "",
    analyzedOnly: search.analyzedOnly === true || search.analyzedOnly === "true",
  }),
  loaderDeps: ({ search }: { search: JobSearchParams }) => search,
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async ({ deps }: { deps: JobSearchParams }) => {
    const [resume, savedSearches, history, cronInfo] = await Promise.all([
      getResume(),
      getSavedPipelineSearches(),
      getPipelineJobHistory({
        data: {
          ...deps,
          pageSize: PAGE_SIZE,
          excludeDiscovered: deps.analyzedOnly,
        },
      }),
      getPipelineCronInfo(),
    ]);
    return {
      hasResume: !!resume?.rawText,
      fullName: resume?.fullName || null,
      savedSearches,
      rows: history.rows,
      total: history.total,
      statusCounts: history.statusCounts,
      canViewAllUsers: history.canViewAllUsers,
      cronStartHour: cronInfo.cronStartHour,
    };
  },
  component: JobsPage,
});

// ─── Page component ───────────────────────────────────────────────────────────

function JobsPage() {
  const { page, query, remote, green, sortBy, status: activeStatus, analyzedOnly } = Route.useSearch();
  const { hasResume, fullName, savedSearches: loaderSavedSearches, rows, total, statusCounts, canViewAllUsers, cronStartHour } =
    Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();

  const [jobs, setJobs] = useState<HubJob[]>(rows);
  const [localTotal, setLocalTotal] = useState(total);
  const [inputValue, setInputValue] = useState(query);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<"archive" | "delete" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [cronNewCount, setCronNewCount] = useState(0);
  const didMount = useRef(false);

  const totalPages = Math.ceil(localTotal / PAGE_SIZE);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = jobs.length > 0 && jobs.every((job) => selectedIds.has(job.id));
  const hasActiveFilters = !!(query || green || remote || activeStatus || analyzedOnly);

  const pipeline = useMemo(
    () =>
      JOB_STATUSES.map((status) => ({
        status,
        count: Number(statusCounts?.[status] ?? 0),
        percent: localTotal > 0 ? Math.round((Number(statusCounts?.[status] ?? 0) / localTotal) * 100) : 0,
      })),
    [localTotal, statusCounts],
  );

  useEffect(() => {
    setJobs(rows);
    setLocalTotal(total);
    setSelectedIds(new Set());
  }, [rows, total]);

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

  async function handleStatusChange(id: number, status: LinkedinJobStatus) {
    const previousRows = jobs;
    setPendingStatusId(id);
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, status } : job)));
    try {
      await setPipelineJobStatus({ data: { id, status } });
      await router.invalidate();
    } catch (error) {
      setJobs(previousRows);
      alert(error instanceof Error ? error.message : "Unable to update job status.");
    } finally {
      setPendingStatusId(null);
    }
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const previousRows = jobs;
    setPendingBulkAction("archive");
    setJobs((prev) =>
      prev.map((job) => (selectedIds.has(job.id) ? { ...job, status: "Archived" as const } : job)),
    );
    try {
      await archivePipelineJobs({ data: { ids } });
      setSelectedIds(new Set());
      await router.invalidate();
    } catch (error) {
      setJobs(previousRows);
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
    try {
      const result = await deletePipelineJobs({ data: { ids } });
      const deleted = result.deleted ?? ids.length;
      const nextTotal = Math.max(0, localTotal - deleted);
      setJobs((prev) => prev.filter((job) => !selectedIds.has(job.id)));
      setLocalTotal(nextTotal);
      setSelectedIds(new Set());

      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > nextTotalPages) {
        await navigate({ search: (prev) => ({ ...prev, page: nextTotalPages }) });
      } else {
        await router.invalidate();
      }
    } catch (error) {
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
      setJobs((prev) => [...incoming, ...prev]);
    }
    void router.invalidate();
  }

  function openFreshDrawer() {
    setDrawerOpen(true);
  }

  function toggleStatusFilter(status: LinkedinJobStatus) {
    navigate({
      search: (prev) => ({
        ...prev,
        status: prev.status === status ? "" : status,
        page: 1,
        analyzedOnly: status === "Discovered" ? false : prev.analyzedOnly,
      }),
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Caliber"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="Your High-Caliber Job Pipeline"
        description={
          canViewAllUsers
            ? "Browse all users' agent jobs and manage the full pipeline."
            : "Deploy background agents to search LinkedIn, Greenhouse, Lever, and Workable on your schedule — surfacing only top-tier matches."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              <Wand2 className="h-4 w-4" />
              Manage Resume
            </Link>
            <button
              type="button"
              onClick={openFreshDrawer}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              <BookMarked className="h-4 w-4" />
              Active Agents
              {loaderSavedSearches.length > 0 && (
                <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {loaderSavedSearches.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={openFreshDrawer}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 hover:text-amber-400"
            >
              <Search className="h-4 w-4" />
              Configure Agents
            </button>
          </div>
        }
      />

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
                  void router.invalidate();
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
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8">
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
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring lg:flex-1">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={inputValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                placeholder="Search agent jobs by title or company"
                className="h-auto border-0 bg-transparent px-2 py-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                <option value="score">Sort: Score</option>
                <option value="company">Sort: Company</option>
                <option value="location">Sort: Location</option>
              </select>
              <button
                type="button"
                aria-pressed={green}
                onClick={() => navigate({ search: (prev) => ({ ...prev, green: !green, page: 1 }) })}
                className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition ${
                  green
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Green jobs only
              </button>
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

          {/* Job cards */}
          <div className="grid gap-4 grid-cols-4">
            {jobs.map((job) => (
              <LinkedinResultCard
                key={job.id ?? job.sourceUrl}
                job={{ ...job, resultSource: "history" }}
                isNew={!!job.isNew}
                selected={job.id ? selectedIds.has(job.id) : false}
                showSelection={!!job.id}
                onSelect={job.id ? () => toggleSelected(job.id!) : undefined}
                statusOptions={JOB_STATUSES}
                onStatusChange={job.id ? (status) => handleStatusChange(job.id!, status) : undefined}
                statusPending={job.id ? pendingStatusId === job.id : false}
              />
            ))}
          </div>

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

      <LinkedinSearchDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        hasResume={hasResume}
        fullName={fullName}
        initialSavedSearches={loaderSavedSearches}
        preload={null}
        cronStartHour={cronStartHour}
        onSearchComplete={handleSearchComplete}
      />
    </div>
  );
}

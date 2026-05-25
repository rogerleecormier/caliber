import { createFileRoute } from "@tanstack/react-router";
import { getSearchLogs } from "@/server/functions/get-search-logs";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { useState, useDeferredValue, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  FileText,
  Search,
  Download,
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Terminal,
  Layers,
  ChevronDown,
  Clock,
} from "lucide-react";
import {
  PageHero,
  PageSection,
  Pagination,
} from "@caliber/ui-kit";

type LogsSearchParams = {
  page: number;
  eventType: string;
  platform: string;
  level: string;
  agentName: string;
};

const PAGE_SIZE = 25;

export const Route = createFileRoute("/logs")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  validateSearch: (search: Record<string, unknown>): LogsSearchParams => ({
    page: Math.max(1, Number(search.page) || 1),
    eventType: typeof search.eventType === "string" ? search.eventType : "",
    platform: typeof search.platform === "string" ? search.platform : "",
    level: typeof search.level === "string" ? search.level : "",
    agentName: typeof search.agentName === "string" ? search.agentName : "",
  }),
  component: LogsPage,
  pendingComponent: LogsLoading,
});

const LEVEL_TONES: Record<string, { bg: string; text: string; border: string; dot: string; icon: any }> = {
  info: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-100",
    dot: "bg-slate-400",
    icon: Info,
  },
  success: {
    bg: "bg-emerald-50/50",
    text: "text-emerald-800",
    border: "border-emerald-100/80",
    dot: "bg-emerald-500",
    icon: CheckCircle,
  },
  warning: {
    bg: "bg-amber-50/50",
    text: "text-amber-800",
    border: "border-amber-100/80",
    dot: "bg-amber-500",
    icon: AlertTriangle,
  },
  error: {
    bg: "bg-red-50/50",
    text: "text-red-800",
    border: "border-red-100/80",
    dot: "bg-red-500",
    icon: XCircle,
  },
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workable: "Workable",
  remoteok: "RemoteOK",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  manual: "Manual",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  search_started: "Search Started",
  search_completed: "Search Completed",
  job_found: "Job Found",
  job_skipped_duplicate: "Skipped (Duplicate)",
  job_skipped_filtered: "Skipped (Filtered)",
  ats_search_started: "ATS Search Started",
  ats_search_completed: "ATS Search Completed",
  analysis_started: "Analysis Started",
  analysis_completed: "Analysis Completed",
  analysis_error: "Analysis Error",
  cron_triggered: "Cron Triggered",
  manual_search: "Manual Search",
  job_sync: "Job Ingestion Sync",
  discovery_sync: "Company Discovery Sync",
  error: "System Error",
};

function MetricCard({
  icon,
  label,
  value,
  note,
  accent = "bg-white/80 border-slate-200",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <div className={`rounded-[1.6rem] border p-5 shadow-sm ${accent}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border shadow-sm shrink-0">
          {icon}
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{value}</h3>
        </div>
      </div>
      {note && <p className="text-[11px] text-slate-500 mt-2.5 leading-snug">{note}</p>}
    </div>
  );
}

function LogsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [localAgentName, setLocalAgentName] = useState(search.agentName);
  const deferredAgentName = useDeferredValue(localAgentName);

  useEffect(() => {
    if (deferredAgentName !== search.agentName) {
      navigate({ search: (prev) => ({ ...prev, agentName: deferredAgentName, page: 1 }) });
    }
  }, [deferredAgentName, navigate, search.agentName]);

  const { data, isPending, refetch } = useQuery({
    queryKey: ["logs", search.page, search.eventType, search.platform, search.level, search.agentName],
    queryFn: () =>
      getSearchLogs({
        data: {
          page: search.page,
          pageSize: PAGE_SIZE,
          eventType: search.eventType || undefined,
          platform: search.platform || undefined,
          level: search.level || undefined,
          agentName: search.agentName || undefined,
        },
      }),
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? { totalSearches: 0, totalJobsFound: 0, totalJobsSkipped: 0, totalErrors: 0 };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRefresh = () => {
    refetch();
  };

  function handleFilterChange(key: keyof LogsSearchParams, value: string) {
    navigate({ search: (prev) => ({ ...prev, [key]: value, page: 1 }) });
  }

  function handlePageChange(newPage: number) {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  }

  function handleExportCsv() {
    const headers = ["ID", "Level", "Event Type", "Platform", "Agent Name", "Message", "Created At"];
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.level,
          row.eventType,
          row.platform ?? "",
          row.agentName ?? "",
          `"${row.message.replace(/"/g, '""')}"`,
          row.createdAt,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `caliber_search_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="spx-page space-y-6">
      <PageHero
        eyebrow="Activity Audit"
        icon={<Terminal className="h-3.5 w-3.5" />}
        title="Search Agent Activity Logs"
        description="Audit run outcomes, jobs found, background sync events, and API calls across search channels."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              {isPending ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Search className="h-5 w-5 text-indigo-600" />}
          label="Total Searches"
          value={summary.totalSearches.toLocaleString()}
          note="Saved agents and manual scans run"
          accent="bg-indigo-50/50 border-indigo-100"
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
          label="Jobs Found"
          value={summary.totalJobsFound.toLocaleString()}
          note="Surfaced opportunities in pipeline"
          accent="bg-emerald-50/50 border-emerald-100"
        />
        <MetricCard
          icon={<Layers className="h-5 w-5 text-slate-600" />}
          label="Jobs Skipped"
          value={summary.totalJobsSkipped.toLocaleString()}
          note="Duplicates or score threshold rejects"
          accent="bg-slate-50 border-slate-200"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          label="Errors Logged"
          value={summary.totalErrors.toLocaleString()}
          note="Background runner or API issues"
          accent="bg-red-50/50 border-red-100"
        />
      </div>

      <PageSection
        title="Event Stream"
        description="Filter by channel, run level, or event type to audit background executions."
      >
        {/* Filters */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Event Type
            </label>
            <select
              value={search.eventType}
              onChange={(e) => handleFilterChange("eventType", e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">All Events</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Channel / Platform
            </label>
            <select
              value={search.platform}
              onChange={(e) => handleFilterChange("platform", e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">All Channels</option>
              {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Log Level
            </label>
            <select
              value={search.level}
              onChange={(e) => handleFilterChange("level", e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">All Levels</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Agent Search
            </label>
            <div className="relative">
              <input
                type="text"
                value={localAgentName}
                onChange={(e) => setLocalAgentName(e.target.value)}
                placeholder="Agent name..."
                className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <Search className="absolute left-2.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Logs Table / List */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const tone = LEVEL_TONES[row.level] || LEVEL_TONES.info;
              const Icon = tone.icon;
              return (
                <div
                  key={row.id}
                  className={`p-4 transition hover:bg-slate-50/50 ${tone.bg}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-lg border p-1.5 shrink-0 bg-white shadow-sm border-slate-100`}>
                        <Icon className={`h-4 w-4 ${row.level === 'error' ? 'text-red-500' : row.level === 'warning' ? 'text-amber-500' : row.level === 'success' ? 'text-emerald-500' : 'text-slate-500'}`} />
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.level === 'error' ? 'bg-red-50 text-red-700 border-red-100' : row.level === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-100' : row.level === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                            {row.level}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {EVENT_TYPE_LABELS[row.eventType] || row.eventType}
                          </span>
                          {row.platform && (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {PLATFORM_LABELS[row.platform] || row.platform}
                            </span>
                          )}
                          {row.agentName && (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-100">
                              Agent: {row.agentName}
                            </span>
                          )}
                          {row.metadata && typeof row.metadata.matchScore === 'number' && (
                            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                              Match: {row.metadata.matchScore}%
                            </span>
                          )}
                          {row.metadata && row.metadata.pursue === true && (
                            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              ✓ Pursue
                            </span>
                          )}
                          {row.metadata && row.metadata.pursue === false && (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Skip
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 leading-normal">
                          {row.message}
                        </p>
                        {row.metadata && (row.metadata.jobTitle || row.metadata.company) && (
                          <p className="text-xs text-slate-500 leading-normal">
                            {row.metadata.jobTitle && <span>{row.metadata.jobTitle}</span>}
                            {row.metadata.jobTitle && row.metadata.company && <span> at </span>}
                            {row.metadata.company && <span>{row.metadata.company}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pl-11 md:pl-0 md:text-right shrink-0">
                      <div className="flex flex-col items-start md:items-end gap-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDistanceToNow(parseISO(row.createdAt), { addSuffix: true })}</span>
                        </div>
                        <div className="text-[10px] text-slate-300">
                          {new Date(row.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Details block - analysis data */}
                  {row.metadata && Object.keys(row.metadata).length > 0 && (
                    <div className="mt-3 pl-11">
                      <details className="group rounded-xl border border-slate-200/60 bg-white overflow-hidden shadow-sm">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition select-none">
                          <span className="flex items-center gap-1.5">
                            <Terminal className="h-3.5 w-3.5 text-indigo-500" />
                            Event Details & Metadata
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
                        </summary>
                        <div className="border-t border-slate-200/60 p-4 bg-slate-50/50 space-y-4">
                          {/* Structured metadata display */}
                          {Object.entries(row.metadata as Record<string, unknown>).some(([key, value]) => key !== "workerLogs" && key !== "stats" && typeof value !== "object") && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {Object.entries(row.metadata as Record<string, unknown>).map(([key, value]) => {
                                if (key === "workerLogs" || key === "stats") return null;
                                if (typeof value === "object") return null;
                                return (
                                  <div key={key} className="rounded-lg bg-white border border-slate-100 p-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                      {key.replace(/_/g, " ")}
                                    </p>
                                    <p className="text-sm font-semibold text-slate-900 break-words leading-tight">
                                      {String(value)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Stats dashboard display */}
                          {row.metadata.stats && typeof row.metadata.stats === 'object' && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Run Statistics
                              </p>
                              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                                {Object.entries(row.metadata.stats as Record<string, unknown>).map(([key, value]) => {
                                  if (typeof value === "object" || value === null) return null;
                                  return (
                                    <div key={key} className="rounded-lg bg-white border border-slate-150 p-2.5 shadow-sm">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                        {key.replace(/([A-Z])/g, " $1").trim()}
                                      </p>
                                      <p className="text-sm font-bold text-slate-900 leading-none">
                                        {String(value)}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Beautiful Interactive Terminal for Ingestion Console Logs */}
                          {Array.isArray(row.metadata.workerLogs) && row.metadata.workerLogs.length > 0 && (
                            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-md">
                              <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                  Ingestion Sync Worker Console Log
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">
                                  {row.metadata.workerLogs.length} entries
                                </span>
                              </div>
                              <div className="text-[11px] leading-relaxed overflow-y-auto max-h-72 text-emerald-400 font-mono p-4 space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800">
                                {[...row.metadata.workerLogs].reverse().map((entry: any, i: number) => {
                                  const textTone = entry.type === 'error' ? 'text-red-400 font-semibold' :
                                                   entry.type === 'warning' ? 'text-yellow-400 font-semibold' :
                                                   entry.type === 'success' ? 'text-emerald-300 font-semibold' :
                                                   'text-slate-300';
                                  return (
                                    <div key={i} className={`${textTone} flex items-start gap-2 hover:bg-slate-900/50 py-0.5 rounded px-1 transition-colors`}>
                                      <span className="text-slate-500 shrink-0 select-none">
                                        [{new Date(entry.timestamp).toLocaleTimeString()}]
                                      </span>
                                      <span className="break-all whitespace-pre-wrap">{entry.message}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Raw JSON for complex objects */}
                          {Object.entries(row.metadata as Record<string, unknown>).some(
                            ([k, v]) => k !== "workerLogs" && k !== "stats" && typeof v === "object"
                          ) && (
                            <div className="rounded-lg border border-slate-200 bg-slate-950 overflow-hidden">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pt-2">
                                Full Payload
                              </p>
                              <pre className="text-[10px] leading-relaxed overflow-x-auto text-emerald-400 font-mono select-all p-3">
                                {JSON.stringify(
                                  Object.fromEntries(
                                    Object.entries(row.metadata as Record<string, unknown>).filter(
                                      ([k]) => k !== "workerLogs"
                                    )
                                  ),
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="py-16 text-center">
                <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  No activity logs found matching the current filters.
                </p>
              </div>
            )}
          </div>
        </div>

        <Pagination
          page={search.page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          className="mt-6"
        />
      </PageSection>
    </div>
  );
}

function LogsLoading() {
  return (
    <div className="spx-page space-y-6 animate-pulse">
      <div className="h-28 w-full rounded-2xl bg-white/70 border border-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-[1.6rem] bg-white/70 border border-slate-100" />
        ))}
      </div>
      <div className="h-96 w-full rounded-2xl bg-white/70 border border-slate-100" />
    </div>
  );
}

import { useState } from 'react';
import React from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Database,
  CheckCircle2,
  Clock,
  Globe,
  FileText,
  Server,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { PageHero, PageSection } from '@caliber/ui-kit';
import { getAgentInsights, getAgentInsightsJobs } from '@/server/functions/agent-insights';
import type { FilterKey, AgentInsightsData, JobDetailRow } from '@/server/functions/agent-insights';
import { cleanJobDescription } from '@/lib/html-utils';

export const Route = createFileRoute('/agent-insights')({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
    if (ctx.user.role !== "admin") throw redirect({ to: "/" });
  },
  loader: async () => getAgentInsights({ data: {} }),
  component: AgentInsightsDashboard,
});

const PAGE_SIZE = 25;

const SOURCE_LABELS: Record<string, string> = {
  // ATS platforms
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workable: 'Workable',
  ashby: 'Ashby',
  // Aggregators & crawlers
  adzuna: 'Adzuna',
  jooble: 'Jooble',
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  himalayas: 'Himalayas',
  jobicy: 'Jobicy',
  // User-added
  manual: 'Manual Entry',
  // Legacy values (still in DB, display gracefully)
  'text-input': 'Manual Entry',
  quick_search: 'Manual Entry',
  search_agent: 'Unknown',
  unknown: 'Unknown',
};

function BoardsTable({ boards, total, page, setPage }: { boards: any[]; total: number; page: number; setPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">
        <span className="text-slate-900 font-bold">{total.toLocaleString()}</span> active boards
      </p>
      <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">ATS</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Last Crawled</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {boards.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No boards found.</td></tr>
              ) : boards.map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3">
                    <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-blue-200 capitalize">
                      {SOURCE_LABELS[b.ats] || b.ats}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">{b.token}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{b.company_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{b.crawl_frequency_tier || '—'}</td>
                  <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                    {b.last_crawled_at ? new Date(b.last_crawled_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold ${b.crawl_error_count > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {b.crawl_error_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[11px]">
                    {b.discovery_confidence != null ? `${Math.round(b.discovery_confidence * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white/40 px-4 py-3 rounded-2xl shadow-sm">
          <p className="text-sm text-slate-600 font-medium hidden sm:block">
            Showing <span className="font-bold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span>–
            <span className="font-bold text-slate-900">{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
            <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
          </p>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="relative inline-flex items-center px-4 py-2 text-sm font-bold text-slate-900 ring-1 ring-inset ring-slate-300">
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function JobDetailTable({ filter, subFilter }: { filter: FilterKey; subFilter: string | null }) {
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['agent-insights-jobs', filter, subFilter, page],
    queryFn: () => getAgentInsightsJobs({ data: { filter, subFilter, page, pageSize: PAGE_SIZE } }),
  });

  React.useEffect(() => { setPage(1); setExpandedRows({}); }, [filter, subFilter]);

  const isBoardsFilter = filter === 'boards';
  const jobs: JobDetailRow[] = (!isBoardsFilter && data?.jobs) ? data.jobs : [];
  const boards: any[] = (isBoardsFilter && (data as any)?.boards) ? (data as any).boards : [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin mr-3" />
        Loading...
      </div>
    );
  }

  if (isBoardsFilter) {
    return <BoardsTable boards={boards} total={total} page={page} setPage={setPage} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">
        <span className="text-slate-900 font-bold">{total.toLocaleString()}</span> jobs
        {subFilter && (
          <span className="ml-1 text-slate-400">
            · <span className="text-orange-600 font-bold">{SOURCE_LABELS[subFilter] || subFilter}</span>
          </span>
        )}
      </p>

      <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">ATS</th>
                <th className="px-4 py-3">Sources</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">First Seen</th>
                <th className="px-4 py-3">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">No jobs found.</td>
                </tr>
              ) : jobs.map((job: JobDetailRow) => {
                const isExpanded = !!expandedRows[job.id];
                const showJson = !!showRawJson[job.id];

                return (
                  <React.Fragment key={job.id}>
                    <tr
                      className="hover:bg-slate-50/50 transition cursor-pointer"
                      onClick={() => setExpandedRows(prev => ({ ...prev, [job.id]: !prev[job.id] }))}
                    >
                      <td className="px-4 py-3">
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                          : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-primary-50 text-primary-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-primary-200 max-w-[140px] truncate">
                          {job.companyDisplay}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 max-w-[200px]">
                        <span className="truncate block">{job.titleDisplay}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        <span className="truncate block max-w-[120px]">{job.locationDisplay || (job.remote ? 'Remote' : '—')}</span>
                        {job.remote && (
                          <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded font-bold uppercase">Remote</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {job.ats ? (
                          <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-slate-200 capitalize">
                            {SOURCE_LABELS[job.ats] || job.ats}
                          </span>
                        ) : <span className="text-slate-300 text-[10px]">None</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] font-semibold">
                        {job.sourceCount > 0 ? `${job.sourceCount} source${job.sourceCount !== 1 ? 's' : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {job.isExpired
                          ? <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Expired</span>
                          : <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Active</span>
                        }
                      </td>
                      <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                        {job.firstSeenAt ? new Date(job.firstSeenAt).toLocaleDateString() : '—'}
                      </td>
                      <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                        {job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={9} className="px-5 py-5 border-t border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">

                            {/* Left — description + sources */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Job Description</h4>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-56 overflow-y-auto text-slate-600 font-medium leading-relaxed whitespace-pre-wrap text-[11px]">
                                  {cleanJobDescription(job.descriptionPlain || '') || (
                                    <span className="text-slate-300 italic">No description available</span>
                                  )}
                                </div>
                              </div>

                              {job.allSources.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    ATS Sources ({job.allSources.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {job.allSources.map((s, i) => (
                                      <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-2">
                                            <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-blue-200 capitalize">
                                              {SOURCE_LABELS[s.ats] || s.ats}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-500">{s.boardToken}</span>
                                            <span className="text-[10px] text-slate-400">Job ID: {s.sourceJobId}</span>
                                          </div>
                                          <div suppressHydrationWarning className="text-[10px] text-slate-400 font-mono">
                                            First: {new Date(s.firstSeenAt).toLocaleDateString()} · Last: {new Date(s.lastSeenAt).toLocaleDateString()}
                                          </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                          {s.sourceUrl && (
                                            <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer"
                                              onClick={e => e.stopPropagation()}
                                              className="text-[10px] font-bold text-slate-500 hover:text-primary-600 underline">
                                              Source
                                            </a>
                                          )}
                                          {s.applyUrl && (
                                            <a href={s.applyUrl} target="_blank" rel="noopener noreferrer"
                                              onClick={e => e.stopPropagation()}
                                              className="text-[10px] font-bold text-teal-600 hover:text-teal-800 underline">
                                              Apply
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Right — metadata + raw JSON */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Job Metadata</h4>
                                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {job.employmentType && (
                                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.employmentType}</span>
                                    )}
                                    {job.experienceLevel && (
                                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.experienceLevel}</span>
                                    )}
                                    {job.department && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.department}</span>
                                    )}
                                    {job.team && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.team}</span>
                                    )}
                                    {job.remote && (
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase">Remote</span>
                                    )}
                                  </div>

                                  {(job.compensationMin || job.compensationMax) && (
                                    <div className="pt-1 border-t border-slate-100">
                                      <span className="text-[10px] text-slate-400 font-semibold uppercase mr-2">Compensation</span>
                                      <span className="text-sm font-bold text-green-700">
                                        {job.compensationMin && `$${job.compensationMin.toLocaleString()}`}
                                        {job.compensationMin && job.compensationMax && ' – '}
                                        {job.compensationMax && `$${job.compensationMax.toLocaleString()}`}
                                        {job.compensationCurrency && ` ${job.compensationCurrency}`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Dates</h4>
                                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 font-mono text-[10.5px]">
                                  {job.firstSeenAt && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">First Seen</span>
                                      <span suppressHydrationWarning className="text-slate-700">{new Date(job.firstSeenAt).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {job.lastSeenAt && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Last Seen</span>
                                      <span suppressHydrationWarning className="text-slate-700">{new Date(job.lastSeenAt).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {job.expiresAt && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Expires</span>
                                      <span suppressHydrationWarning className={`font-bold ${job.isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                                        {new Date(job.expiresAt).toLocaleString()}
                                        {job.isExpired && ' (expired)'}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Dedup Key</span>
                                    <span className="text-slate-500 truncate max-w-[200px]">{job.dedupKey}</span>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowRawJson(prev => ({ ...prev, [job.id]: !prev[job.id] })); }}
                                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 flex items-center gap-1 transition cursor-pointer"
                                >
                                  {showJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  Raw JSON
                                </button>
                                {showJson && (
                                  <pre className="mt-2 bg-slate-900 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto max-h-56 leading-relaxed shadow-sm">
                                    {JSON.stringify({
                                      id: job.id,
                                      dedupKey: job.dedupKey,
                                      company: job.companyDisplay,
                                      title: job.titleDisplay,
                                      location: job.locationDisplay,
                                      remote: job.remote,
                                      employmentType: job.employmentType,
                                      experienceLevel: job.experienceLevel,
                                      department: job.department,
                                      team: job.team,
                                      compensation: {
                                        min: job.compensationMin,
                                        max: job.compensationMax,
                                        currency: job.compensationCurrency,
                                      },
                                      firstSeenAt: job.firstSeenAt,
                                      lastSeenAt: job.lastSeenAt,
                                      expiresAt: job.expiresAt,
                                      isExpired: job.isExpired,
                                      sources: job.allSources,
                                    }, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white/40 px-4 py-3 rounded-2xl shadow-sm">
          <p className="text-sm text-slate-600 font-medium hidden sm:block">
            Showing <span className="font-bold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span>–
            <span className="font-bold text-slate-900">{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
            <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
          </p>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="relative inline-flex items-center px-4 py-2 text-sm font-bold text-slate-900 ring-1 ring-inset ring-slate-300">
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function AgentInsightsDashboard() {
  const loaderData = Route.useLoaderData() as AgentInsightsData;

  // Default to 'total' so the job table loads immediately on page open
  const [activeFilter, setActiveFilter] = useState<FilterKey>('total');
  const [subFilter, setSubFilter] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['agent-insights'],
    queryFn: () => getAgentInsights({ data: {} }),
    initialData: loaderData,
    refetchInterval: 30000,
  });

  const d = data || loaderData;

  function handleFilterClick(f: FilterKey) {
    if (activeFilter === f) return; // already active, no-op (always keep one active)
    setActiveFilter(f);
    setSubFilter(null);
  }

  function handleSubFilterClick(val: string) {
    setSubFilter(prev => prev === val ? null : val);
  }

  const statTiles = [
    {
      key: 'total' as FilterKey,
      title: 'Total Jobs',
      value: d.totalJobs,
      desc: 'All canonical jobs (is_listed)',
      icon: Database,
      accentBg: 'bg-slate-700',
      activeBorder: 'border-slate-700',
      activeBg: 'bg-slate-50',
    },
    {
      key: 'active' as FilterKey,
      title: 'Active Jobs',
      value: d.activeJobs,
      desc: 'Not expired',
      icon: CheckCircle2,
      accentBg: 'bg-teal-600',
      activeBorder: 'border-teal-500',
      activeBg: 'bg-teal-50',
    },
    {
      key: 'expired' as FilterKey,
      title: 'Expired Jobs',
      value: d.expiredJobs,
      desc: 'Past expires_at',
      icon: Clock,
      accentBg: 'bg-red-500',
      activeBorder: 'border-red-400',
      activeBg: 'bg-red-50',
    },
    {
      key: 'crawler' as FilterKey,
      title: 'Crawler Jobs',
      value: d.crawlerJobs,
      desc: 'Has ATS board source',
      icon: Globe,
      accentBg: 'bg-blue-600',
      activeBorder: 'border-blue-500',
      activeBg: 'bg-blue-50',
    },
    {
      key: 'manual' as FilterKey,
      title: 'Manual / Other',
      value: d.manualJobs,
      desc: 'No ATS board source',
      icon: FileText,
      accentBg: 'bg-orange-500',
      activeBorder: 'border-orange-400',
      activeBg: 'bg-orange-50',
    },
    {
      key: 'boards' as FilterKey,
      title: 'Active Boards',
      value: d.activeBoards,
      desc: 'Crawl targets',
      icon: Server,
      accentBg: 'bg-purple-600',
      activeBorder: 'border-purple-500',
      activeBg: 'bg-purple-50',
    },
  ];

  // Tier 2 breakdown options for active filter
  const tier2Config: { title: string; entries: { label: string; value: string; count: number }[] } | null = (() => {
    if (activeFilter === 'crawler' || activeFilter === 'total' || activeFilter === 'active' || activeFilter === 'expired') {
      const map = activeFilter === 'crawler' ? d.crawlerByAts : d.jobsByAts;
      const entries = (Object.entries(map) as [string, number][]).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
      if (entries.length === 0) return null;
      return { title: 'Breakdown by ATS', entries };
    }
    if (activeFilter === 'boards') {
      const entries = (Object.entries(d.boardsByAts) as [string, number][]).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
      if (entries.length === 0) return null;
      return { title: 'Boards by ATS', entries };
    }
    return null;
  })();

  return (
    <div className="space-y-6 pb-12">
      <PageHero
        eyebrow="Operations"
        icon={<BarChart3 className="h-5 w-5" />}
        title="Agent Insights"
        description="Global catalog health — ATS sources, board coverage, and job lifecycle metrics"
      />

      {/* Tier 1 — 6 stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statTiles.map(tile => {
          const Icon = tile.icon;
          const isActive = activeFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => handleFilterClick(tile.key)}
              className={`text-left rounded-xl border-2 p-4 transition cursor-pointer shadow-sm ${
                isActive
                  ? `${tile.activeBorder} ${tile.activeBg} shadow-md`
                  : 'border-transparent bg-white/80 hover:border-slate-200 hover:shadow'
              }`}
            >
              <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg mb-2 ${tile.accentBg}`}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{tile.value.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-slate-700 mt-0.5">{tile.title}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{tile.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Tier 2 — ATS breakdown chips */}
      {tier2Config && (
        <div className="bg-white/70 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{tier2Config.title}</h3>
            {subFilter && (
              <button type="button" onClick={() => setSubFilter(null)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer">
                <X className="h-3 w-3" /> Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {tier2Config.entries.map(entry => (
              <button
                key={entry.value}
                type="button"
                onClick={() => handleSubFilterClick(entry.value)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                  subFilter === entry.value
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:text-orange-700 shadow-sm'
                }`}
              >
                <span className="capitalize">{entry.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  subFilter === entry.value ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {entry.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Crawl Health (24 h) */}
      {Object.keys(d.crawlsByAts || {}).length > 0 && (
        <div className="bg-white/70 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Crawl Health — Last 24 h</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-2 text-left w-32">Source</th>
                  <th className="pb-2 text-right pr-6">Crawls</th>
                  <th className="pb-2 text-right pr-6">Errors</th>
                  <th className="pb-2 text-right">Error Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(d.crawlsByAts || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([ats, crawls]) => {
                    const errors = (d.errorsByAts || {})[ats] || 0;
                    const rate = crawls > 0 ? Math.round((errors / crawls) * 100) : 0;
                    return (
                      <tr key={ats}>
                        <td className="py-2 pr-2">
                          <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-slate-200 capitalize">
                            {SOURCE_LABELS[ats] || ats}
                          </span>
                        </td>
                        <td className="py-2 pr-6 text-right font-bold text-slate-800 tabular-nums">{crawls}</td>
                        <td className="py-2 pr-6 text-right tabular-nums">
                          {errors > 0
                            ? <span className="font-bold text-red-600">{errors}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {errors > 0
                            ? <span className={`font-bold ${rate >= 20 ? 'text-red-600' : rate >= 5 ? 'text-amber-600' : 'text-slate-500'}`}>{rate}%</span>
                            : <span className="text-emerald-600 font-bold">0%</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tier 3 — job detail table (always visible, defaults to 'total') */}
      <PageSection>
        <JobDetailTable filter={activeFilter} subFilter={subFilter} />
      </PageSection>
    </div>
  );
}

import { useState } from 'react';
import React from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Database,
  CheckCircle2,
  Archive,
  Globe,
  FileText,
  Bot,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Star,
  Flag,
  Sparkles,
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
  loader: async () => {
    return getAgentInsights({ data: {} });
  },
  component: AgentInsightsDashboard,
});

const PAGE_SIZE = 25;

const STAGE_COLORS: Record<string, string> = {
  Favorited: 'bg-amber-50 border-amber-200 text-amber-700',
  Analyzed: 'bg-blue-50 border-blue-200 text-blue-700',
  Prepped: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  Applied: 'bg-teal-50 border-teal-200 text-teal-700',
  Interviewed: 'bg-purple-50 border-purple-200 text-purple-700',
  Hired: 'bg-green-50 border-green-200 text-green-700',
  'Not Hired': 'bg-red-50 border-red-200 text-red-700',
  Archived: 'bg-slate-100 border-slate-300 text-slate-500',
};

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workable: 'Workable',
  ashby: 'Ashby',
  adzuna: 'Adzuna',
  jooble: 'Jooble',
  remotive: 'Remotive',
  linkedin: 'LinkedIn',
  manual: 'Manual',
};

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-slate-100 text-slate-500';
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 60) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="flex flex-col items-center">
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(value)}`}>{value}</span>
      <span className="text-[9px] text-slate-400 mt-0.5 uppercase font-semibold tracking-wider">{label}</span>
    </div>
  );
}

function JobDetailTable({ filter, subFilter, isArchivesTab }: { filter: FilterKey | null; subFilter: string | null; isArchivesTab?: boolean }) {
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});

  const activeFilter = isArchivesTab ? 'archived' : filter;

  const { data, isLoading } = useQuery({
    queryKey: ['agent-insights-jobs', activeFilter, subFilter, page],
    queryFn: () => getAgentInsightsJobs({ data: { filter: activeFilter as FilterKey, subFilter, page, pageSize: PAGE_SIZE } }),
    enabled: !!activeFilter,
  });

  const jobs = data?.jobs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Reset page when filter changes
  React.useEffect(() => { setPage(1); setExpandedRows({}); }, [activeFilter, subFilter]);

  if (!activeFilter) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin mr-3" />
        Loading jobs...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">
          <span className="text-slate-900 font-bold">{total.toLocaleString()}</span> jobs found
          {subFilter && <span className="ml-1 text-slate-400">· filtered by <span className="text-orange-600 font-bold">{SOURCE_LABELS[subFilter] || subFilter}</span></span>}
        </p>
      </div>

      <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">ATS / Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">First Seen</th>
                <th className="px-4 py-3">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No jobs found for this filter.
                  </td>
                </tr>
              ) : (
                jobs.map((job: JobDetailRow) => {
                  const rowKey = job.normalizedId ? `n-${job.normalizedId}` : job.id;
                  const isExpanded = !!expandedRows[rowKey];
                  const showJson = !!showRawJson[rowKey];
                  const displayAts = job.ats || job.sourceOrigin;
                  const keywords: string[] = (() => {
                    try { return job.keywords ? JSON.parse(job.keywords) : []; } catch { return []; }
                  })();

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className="hover:bg-slate-50/50 transition cursor-pointer"
                        onClick={() => setExpandedRows(prev => ({ ...prev, [rowKey]: !prev[rowKey] }))}
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
                          {job.isUnicorn && <span className="ml-0 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-bold uppercase">Unicorn</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-medium">
                          <span className="truncate block max-w-[120px]">{job.locationDisplay || (job.remote ? 'Remote' : '—')}</span>
                          {job.remote && <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded font-bold uppercase">Remote</span>}
                        </td>
                        <td className="px-4 py-3">
                          {displayAts ? (
                            <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-slate-200 capitalize">
                              {SOURCE_LABELS[displayAts] || displayAts}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {job.currentStage ? (
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${STAGE_COLORS[job.currentStage] || 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                              {job.currentStage}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {(job.masterScore !== null || job.matchScore !== null) ? (
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreColor(job.masterScore ?? job.matchScore)}`}>
                              {job.masterScore ?? job.matchScore}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
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

                              {/* Left panel */}
                              <div className="space-y-4">
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Job Description</h4>
                                  <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-56 overflow-y-auto text-slate-600 font-medium leading-relaxed whitespace-pre-wrap text-[11px]">
                                    {cleanJobDescription(job.descriptionPlain || '') || <span className="text-slate-300 italic">No description available</span>}
                                  </div>
                                </div>

                                {(job.allSources?.length > 0 || job.sourceUrl) && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                      Sources ({job.allSources?.length || (job.sourceUrl ? 1 : 0)})
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {job.allSources?.length > 0 ? job.allSources.map((s, i) => (
                                        <a
                                          key={i}
                                          href={s.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:text-primary-600 hover:border-primary-300 transition capitalize shadow-sm"
                                        >
                                          <Globe className="h-3 w-3 text-slate-400" />
                                          {SOURCE_LABELS[s.ats] || s.ats} · {s.boardToken}
                                        </a>
                                      )) : job.sourceUrl ? (
                                        <a
                                          href={job.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:text-primary-600 hover:border-primary-300 transition capitalize shadow-sm"
                                        >
                                          <Globe className="h-3 w-3 text-slate-400" />
                                          {SOURCE_LABELS[job.sourceOrigin || ''] || job.sourceOrigin || 'View job'}
                                        </a>
                                      ) : null}
                                    </div>
                                  </div>
                                )}

                                {job.quickAnalysis && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">AI Quick Analysis</h4>
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-slate-700 text-[11px] leading-relaxed">
                                      {job.quickAnalysis}
                                    </div>
                                  </div>
                                )}

                                {job.gapAnalysis && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Gap Analysis</h4>
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-slate-700 text-[11px] leading-relaxed">
                                      {job.gapAnalysis}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right panel */}
                              <div className="space-y-4">
                                {/* Scores */}
                                {(job.atsScore !== null || job.careerScore !== null || job.outlookScore !== null || job.masterScore !== null || job.matchScore !== null) && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">AI Scores</h4>
                                    <div className="flex gap-4 flex-wrap bg-white border border-slate-200 rounded-xl p-3">
                                      <ScoreBadge label="ATS" value={job.atsScore} />
                                      <ScoreBadge label="Career" value={job.careerScore} />
                                      <ScoreBadge label="Outlook" value={job.outlookScore} />
                                      <ScoreBadge label="Master" value={job.masterScore} />
                                      <ScoreBadge label="Match" value={job.matchScore} />
                                    </div>
                                  </div>
                                )}

                                {/* Flags */}
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Pipeline Info</h4>
                                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                    {job.currentStage && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 w-20 font-semibold uppercase">Stage</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STAGE_COLORS[job.currentStage] || 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                          {job.currentStage}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 flex-wrap">
                                      {job.isFavorited && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                          <Star className="h-3 w-3" /> Favorited
                                        </span>
                                      )}
                                      {job.isUnicorn && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                          <Sparkles className="h-3 w-3" /> Unicorn
                                        </span>
                                      )}
                                      {job.isFlagged && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                          <Flag className="h-3 w-3" /> Flagged
                                        </span>
                                      )}
                                    </div>
                                    {job.unicornReason && (
                                      <p className="text-[10.5px] text-slate-500 italic">{job.unicornReason}</p>
                                    )}
                                    {job.workplaceType && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 w-20 font-semibold uppercase">Workplace</span>
                                        <span className="text-[10px] text-slate-600 font-medium capitalize">{job.workplaceType}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Keywords */}
                                {keywords.length > 0 && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Keywords ({keywords.length})</h4>
                                    <div className="flex flex-wrap gap-1.5">
                                      {keywords.slice(0, 20).map((kw: string, i: number) => (
                                        <span key={i} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                          {kw}
                                        </span>
                                      ))}
                                      {keywords.length > 20 && (
                                        <span className="text-[10px] text-slate-400">+{keywords.length - 20} more</span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Dates */}
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
                                    {job.analyzedAt && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Analyzed</span>
                                        <span suppressHydrationWarning className="text-slate-700">{new Date(job.analyzedAt).toLocaleString()}</span>
                                      </div>
                                    )}
                                    {job.expiresAt && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Expires</span>
                                        <span suppressHydrationWarning className="text-slate-700">{new Date(job.expiresAt).toLocaleString()}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Compensation */}
                                {(job.compensationMin || job.compensationMax) && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Compensation</h4>
                                    <p className="text-sm font-bold text-green-700">
                                      {job.compensationMin && `$${job.compensationMin.toLocaleString()}`}
                                      {job.compensationMin && job.compensationMax && ' – '}
                                      {job.compensationMax && `$${job.compensationMax.toLocaleString()}`}
                                      {job.compensationCurrency && ` ${job.compensationCurrency}`}
                                    </p>
                                  </div>
                                )}

                                {/* Job metadata */}
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Metadata</h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {job.employmentType && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.employmentType}</span>}
                                    {job.experienceLevel && <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.experienceLevel}</span>}
                                    {job.department && <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.department}</span>}
                                    {job.team && <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.team}</span>}
                                  </div>
                                </div>

                                {/* Raw JSON toggle */}
                                <div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowRawJson(prev => ({ ...prev, [rowKey]: !prev[rowKey] })); }}
                                    className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 flex items-center gap-1 transition cursor-pointer"
                                  >
                                    {showJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    Raw JSON
                                  </button>
                                  {showJson && (
                                    <pre className="mt-2 bg-slate-900 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto max-h-56 leading-relaxed shadow-sm">
                                      {JSON.stringify({
                                        canonical: {
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
                                          compensation: { min: job.compensationMin, max: job.compensationMax, currency: job.compensationCurrency },
                                          firstSeenAt: job.firstSeenAt,
                                          lastSeenAt: job.lastSeenAt,
                                          expiresAt: job.expiresAt,
                                        },
                                        sources: job.allSources,
                                        normalized: job.normalizedId ? {
                                          id: job.normalizedId,
                                          sourceOrigin: job.sourceOrigin,
                                          currentStage: job.currentStage,
                                          isFavorited: job.isFavorited,
                                          isUnicorn: job.isUnicorn,
                                          isFlagged: job.isFlagged,
                                          scores: { ats: job.atsScore, career: job.careerScore, outlook: job.outlookScore, master: job.masterScore, match: job.matchScore },
                                          keywords,
                                          analyzedAt: job.analyzedAt,
                                          workplaceType: job.workplaceType,
                                        } : null,
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white/40 px-4 py-3 rounded-2xl shadow-sm">
          <p className="text-sm text-slate-600 font-medium hidden sm:block">
            Showing <span className="font-bold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span>–
            <span className="font-bold text-slate-900">{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
            <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
          </p>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="relative inline-flex items-center px-4 py-2 text-sm font-bold text-slate-900 ring-1 ring-inset ring-slate-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
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
  const [activeTab, setActiveTab] = useState<'overview' | 'archives'>('overview');
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['agent-insights'],
    queryFn: () => getAgentInsights({ data: {} }),
    initialData: loaderData,
    refetchInterval: 30000,
  });

  const d = data || loaderData;

  function handleFilterClick(f: FilterKey) {
    if (activeFilter === f) {
      setActiveFilter(null);
      setSubFilter(null);
    } else {
      setActiveFilter(f);
      setSubFilter(null);
    }
  }

  function handleSubFilterClick(val: string) {
    setSubFilter(prev => prev === val ? null : val);
  }

  const statTiles = [
    {
      key: 'total' as FilterKey,
      title: 'Total Jobs',
      value: d.totalJobs,
      desc: 'Canonical, not archived',
      icon: Database,
      color: 'text-slate-700',
      activeColor: 'border-slate-700 bg-slate-50',
    },
    {
      key: 'active' as FilterKey,
      title: 'Active Jobs',
      value: d.activeJobs,
      desc: 'Not expired',
      icon: CheckCircle2,
      color: 'text-teal-600',
      activeColor: 'border-teal-500 bg-teal-50',
    },
    {
      key: 'archived' as FilterKey,
      title: 'Archived',
      value: d.archivedCount,
      desc: 'Pipeline archives',
      icon: Archive,
      color: 'text-slate-500',
      activeColor: 'border-slate-500 bg-slate-100',
    },
    {
      key: 'crawler' as FilterKey,
      title: 'Crawler Jobs',
      value: d.crawlerJobs,
      desc: 'Has ATS board source',
      icon: Globe,
      color: 'text-blue-600',
      activeColor: 'border-blue-500 bg-blue-50',
    },
    {
      key: 'manual' as FilterKey,
      title: 'Manual / Other',
      value: d.manualJobs,
      desc: 'No ATS board source',
      icon: FileText,
      color: 'text-orange-600',
      activeColor: 'border-orange-500 bg-orange-50',
    },
    {
      key: 'agent-found' as FilterKey,
      title: 'Agent-Found',
      value: d.agentFoundJobs,
      desc: 'Adzuna / Jooble / Remotive',
      icon: Bot,
      color: 'text-purple-600',
      activeColor: 'border-purple-500 bg-purple-50',
    },
  ];

  // Tier 2 breakdown data depending on active filter
  function getTier2Entries(): { label: string; value: string; count: number }[] {
    if (!activeFilter) return [];
    if (activeFilter === 'crawler') {
      return Object.entries(d.crawlerByAts).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
    }
    if (activeFilter === 'agent-found') {
      return Object.entries(d.agentBySource).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
    }
    if (activeFilter === 'archived') {
      return Object.entries(d.archivedBySource).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
    }
    // total / active / manual → show status breakdown
    return Object.entries(d.statusBreakdown).map(([k, v]) => ({ label: k, value: k, count: v }));
  }

  const tier2 = getTier2Entries();
  const tier2Title = activeFilter === 'crawler' ? 'Breakdown by ATS'
    : activeFilter === 'agent-found' ? 'Breakdown by Agent Source'
    : activeFilter === 'archived' ? 'Archived by Source'
    : 'Pipeline Status Breakdown';

  return (
    <div className="space-y-6 pb-12">
      <PageHero
        eyebrow="Operations"
        icon={<BarChart3 className="h-5 w-5" />}
        title="Agent Insights"
        description="Full catalog analytics — job sources, pipeline status, and drill-downs by ATS or search agent"
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
              className={`text-left rounded-xl border p-4 transition cursor-pointer shadow-sm group ${
                isActive
                  ? `${tile.activeColor} border-2 shadow-md`
                  : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:shadow'
              }`}
            >
              <div className={`mb-2 ${tile.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className={`text-2xl font-bold ${isActive ? 'text-slate-900' : 'text-slate-800'}`}>
                {tile.value.toLocaleString()}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">{tile.title}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{tile.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {(['overview', 'archives'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); if (tab === 'archives') { setActiveFilter('archived'); setSubFilter(null); } }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            {tab === 'overview' ? 'Overview' : `Archives (${d.archivedCount.toLocaleString()})`}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Tier 2 — breakdown chips */}
          {activeFilter && tier2.length > 0 && (
            <div className="bg-white/70 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{tier2Title}</h3>
                {subFilter && (
                  <button
                    type="button"
                    onClick={() => setSubFilter(null)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="h-3 w-3" /> Clear filter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {tier2.map(entry => (
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

          {/* No filter selected hint */}
          {!activeFilter && (
            <div className="text-center py-10 text-slate-400">
              <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Click a stat tile above to drill into jobs</p>
            </div>
          )}

          {/* Tier 3 — job detail table */}
          {activeFilter && activeFilter !== 'archived' && (
            <PageSection>
              <JobDetailTable filter={activeFilter} subFilter={subFilter} />
            </PageSection>
          )}

          {activeFilter === 'archived' && (
            <PageSection>
              <JobDetailTable filter={activeFilter} subFilter={subFilter} isArchivesTab={false} />
            </PageSection>
          )}
        </div>
      )}

      {/* Archives Tab */}
      {activeTab === 'archives' && (
        <div className="space-y-5">
          <div className="bg-white/70 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Archived by Source Origin</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.archivedBySource).length > 0
                ? Object.entries(d.archivedBySource).map(([src, count]) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => handleSubFilterClick(src)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                        subFilter === src
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:text-orange-700 shadow-sm'
                      }`}
                    >
                      <span className="capitalize">{SOURCE_LABELS[src] || src}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                        subFilter === src ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {count.toLocaleString()}
                      </span>
                    </button>
                  ))
                : <p className="text-sm text-slate-400 italic">No archived jobs found.</p>
              }
              {subFilter && (
                <button
                  type="button"
                  onClick={() => setSubFilter(null)}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer ml-2"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>

          <PageSection>
            <JobDetailTable filter={null} subFilter={subFilter} isArchivesTab={true} />
          </PageSection>
        </div>
      )}
    </div>
  );
}

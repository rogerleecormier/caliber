import { useState } from 'react';
import React from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Bot,
  Search,
  RefreshCw,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Globe,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  PageHero,
  PageSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Pagination,
} from '@caliber/ui-kit';
import { toast } from 'sonner';
import {
  getAgentsAdminOverview,
  getDiscoveryLogs,
  getCrawlerLogs,
  getDiscoveryBoards,
  type DiscoveryLogRow,
  type CrawlerLogRow,
} from '@/server/functions/agents-admin';
import { getAgentInsightsJobs } from '@/server/functions/agent-insights';
import type { FilterKey, JobDetailRow } from '@/server/functions/agent-insights';
import { cleanJobDescription } from '@/lib/html-utils';

export const Route = createFileRoute('/agents-admin')({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) throw redirect({ to: '/login' });
    if (ctx.user.role !== 'admin') throw redirect({ to: '/' });
  },
  loader: async () => getAgentsAdminOverview({ data: {} }),
  component: AgentsAdminDashboard,
});

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  remoteok: 'RemoteOK',
  himalayas: 'Himalayas',
  jobicy: 'Jobicy',
  adzuna: 'Adzuna',
  jooble: 'Jooble',
  remotive: 'Remotive',
  manual: 'Manual Entry',
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  greenhouse: { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-500' },
  lever: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
  ashby: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500' },
  workable: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  remoteok: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' },
  himalayas: { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500' },
  jobicy: { bg: 'bg-lime-50', text: 'text-lime-700', bar: 'bg-lime-500' },
  adzuna: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
  jooble: { bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-500' },
  remotive: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
};
const DEFAULT_COLOR = { bg: 'bg-slate-50', text: 'text-slate-700', bar: 'bg-slate-400' };

const ATS_OPTIONS = ['greenhouse', 'lever', 'ashby', 'workable', 'remoteok', 'himalayas', 'jobicy', 'adzuna', 'jooble', 'remotive'];

type TabKey = 'overview' | 'discovery-logs' | 'crawler-logs' | 'jobs';

function StatTile({ label, value, color = 'text-slate-900', desc }: { label: string; value: React.ReactNode; color?: string; desc?: string }) {
  return (
    <div className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {desc && <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>}
    </div>
  );
}

function SourceHealthPanel({
  jobsByAts,
  boardsByAts,
  crawlsByAts,
  errorsByAts,
}: {
  jobsByAts: Record<string, number>;
  boardsByAts: Record<string, number>;
  crawlsByAts: Record<string, number>;
  errorsByAts: Record<string, number>;
}) {
  const allAts = Array.from(new Set([...Object.keys(jobsByAts), ...Object.keys(boardsByAts)]))
    .sort((a, b) => (jobsByAts[b] || 0) - (jobsByAts[a] || 0));
  const maxJobs = Math.max(...allAts.map(a => jobsByAts[a] || 0), 1);

  if (allAts.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Source Health</h3>
        <span className="text-[10px] text-slate-400 font-medium">{allAts.length} active sources</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="pb-2 text-left w-28">Source</th>
              <th className="pb-2 text-right pr-4">Jobs</th>
              <th className="pb-2 text-left pl-2" style={{ width: '40%' }}></th>
              <th className="pb-2 text-right pr-4">Boards</th>
              <th className="pb-2 text-right pr-4">Crawls 24h</th>
              <th className="pb-2 text-right">Errors 24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {allAts.map(ats => {
              const c = SOURCE_COLORS[ats] || DEFAULT_COLOR;
              const jobs = jobsByAts[ats] || 0;
              const boards = boardsByAts[ats] || 0;
              const crawls = crawlsByAts[ats] || 0;
              const errors = errorsByAts[ats] || 0;
              const barPct = Math.round((jobs / maxJobs) * 100);
              return (
                <tr key={ats}>
                  <td className="py-2 pr-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-extrabold uppercase ${c.bg} ${c.text} border-current/20`}>
                      {SOURCE_LABELS[ats] || ats}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right font-bold text-slate-800 tabular-nums">{jobs.toLocaleString()}</td>
                  <td className="py-2 pl-2 pr-4">
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${barPct}%` }} />
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-500 tabular-nums">{boards}</td>
                  <td className="py-2 pr-4 text-right text-slate-500 tabular-nums">{crawls || '—'}</td>
                  <td className="py-2 text-right tabular-nums">
                    {errors > 0 ? <span className="font-bold text-red-600">{errors}</span> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventBadge({ eventType }: { eventType: string }) {
  const cls =
    eventType === 'crawl_start' ? 'bg-blue-50 border-blue-200 text-blue-700' :
    eventType === 'crawl_complete' ? 'bg-green-50 border-green-200 text-green-700' :
    eventType === 'dedup_merge' ? 'bg-amber-50 border-amber-200 text-amber-700' :
    eventType === 'vector_insert' ? 'bg-purple-50 border-purple-200 text-purple-700' :
    eventType === 'board_discovered' ? 'bg-green-50 border-green-200 text-green-700' :
    eventType === 'board_validation_failed' ? 'bg-red-50 border-red-200 text-red-700' :
    'bg-red-50 border-red-200 text-red-700';
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${cls}`}>
      {eventType}
    </span>
  );
}

function AtsBadge({ ats }: { ats: string | null }) {
  if (!ats) return <span className="text-slate-300">—</span>;
  const c = SOURCE_COLORS[ats] || DEFAULT_COLOR;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-extrabold uppercase ${c.bg} ${c.text}`}>
      {SOURCE_LABELS[ats] || ats}
    </span>
  );
}

// ── Discovery Candidates Panel (board validate/pause/delete) ───────────
function DiscoveryCandidatesPanel({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [search, setSearch] = useState('');
  const [atsFilter, setAtsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'validated' | 'unvalidated'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['discovery-boards', search, atsFilter, statusFilter, page],
    queryFn: () => getDiscoveryBoards({ data: { search, ats: atsFilter, status: statusFilter, page, pageSize: PAGE_SIZE } }),
  });

  const boards = data?.boards || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['discovery-boards'] });

  const validateBoardMutation = useMutation({
    mutationFn: async (boardId: string) => {
      const res = await fetch('/api/discovery/validate-board', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId }),
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Validation request failed');
      return data;
    },
    onSuccess: (data) => {
      toast[data.validated ? 'success' : 'error'](data.validated ? 'Board token validated — active crawl enabled' : 'Board validation failed. Check endpoint validity.');
    },
    onError: (err: any) => toast.error(err.message || 'Error validating board'),
    onSettled: invalidate,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ boardId, nextActive }: { boardId: string; nextActive: boolean }) => {
      const res = await fetch('/api/crawl/toggle-board', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, is_active: nextActive }),
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to toggle board status');
      return data;
    },
    onSuccess: () => toast.success('Crawler board status updated'),
    onError: (err: any) => toast.error(err.message || 'Error updating board status'),
    onSettled: invalidate,
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async (boardId: string) => {
      const res = await fetch('/api/discovery/delete-board', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId }),
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to delete board');
      return data;
    },
    onSuccess: () => toast.success('Board removed from discovery results'),
    onError: (err: any) => toast.error(err.message || 'Error deleting board'),
    onSettled: invalidate,
  });

  const isAnyMutationPending = validateBoardMutation.isPending || toggleActiveMutation.isPending || deleteBoardMutation.isPending;

  return (
    <PageSection
      title="Discovery Candidates"
      description="Explore recently discovered ATS board tokens, validate status, and approve crawler tracking."
      actions={<span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{total} candidates</span>}
    >
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search by company or token name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          <Select value={atsFilter} onValueChange={v => { setAtsFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All ATS Platforms" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ATS Platforms</SelectItem>
              {ATS_OPTIONS.map(a => <SelectItem key={a} value={a}>{SOURCE_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All Validation Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Validation Statuses</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
              <SelectItem value="unvalidated">Unvalidated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Company</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">ATS</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Token</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Confidence</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Phase</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-medium">Loading…</td></tr>
              ) : boards.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-medium">No discovered boards match filters.</td></tr>
              ) : boards.map((board) => (
                <tr key={board.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 align-middle text-sm font-normal">{board.companyName || board.token.charAt(0).toUpperCase() + board.token.slice(1)}</td>
                  <td className="p-4 align-middle text-sm font-normal"><AtsBadge ats={board.ats} /></td>
                  <td className="p-4 align-middle text-sm font-normal"><span className="font-mono text-xs text-slate-700">{board.token}</span></td>
                  <td className="p-4 align-middle text-sm font-normal"><span className="font-semibold text-slate-900">{board.discoveryConfidence ?? 0.7}</span></td>
                  <td className="p-4 align-middle text-sm font-normal capitalize">{(board.discoveryPhase || 'manual').replace(/_/g, ' ')}</td>
                  <td className="p-4 align-middle text-sm font-normal">
                    {board.validated ? (
                      <span className="inline-flex items-center gap-1 text-teal-700 font-semibold text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Validated</span>
                    ) : board.validationErrorCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs" title={`${board.validationErrorCount} validation failures`}><XCircle className="w-3.5 h-3.5" />Failed ({board.validationErrorCount})</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-medium text-xs"><HelpCircle className="w-3.5 h-3.5" />Unchecked</span>
                    )}
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    <div className="flex items-center justify-end gap-1.5">
                      {!board.validated && (
                        <button onClick={() => validateBoardMutation.mutate(board.id)} disabled={isAnyMutationPending} className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition cursor-pointer">
                          Validate
                        </button>
                      )}
                      {board.validated && (
                        <button
                          onClick={() => toggleActiveMutation.mutate({ boardId: board.id, nextActive: !board.isActive })}
                          disabled={isAnyMutationPending}
                          className={`px-2 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${board.isActive ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                        >
                          {board.isActive ? 'Pause' : 'Activate'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Are you sure you want to delete this board from discovery results?')) deleteBoardMutation.mutate(board.id); }}
                        disabled={isAnyMutationPending}
                        className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="border-t border-slate-100 px-1 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </PageSection>
  );
}

// ── Discovery Logs Tab ──────────────────────────────────────────────────
function DiscoveryLogsTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [search, setSearch] = useState('');
  const [atsFilter, setAtsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['discovery-logs', search, atsFilter, statusFilter, page],
    queryFn: () => getDiscoveryLogs({ data: { search, ats: atsFilter, status: statusFilter, page, pageSize: PAGE_SIZE } }),
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns: ColumnDef<DiscoveryLogRow>[] = [
    {
      id: 'time', header: 'Time', size: 130,
      cell: ({ row }) => <span suppressHydrationWarning className="text-slate-400 text-[10px] font-mono">{new Date(row.original.createdAt).toLocaleString()}</span>,
    },
    {
      id: 'event', header: 'Event',
      cell: ({ row }) => <EventBadge eventType={row.original.eventType} />,
    },
    {
      id: 'source', header: 'ATS / Token',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <AtsBadge ats={row.original.ats} />
          <span className="text-slate-500 font-mono text-[10px]">{row.original.boardToken}</span>
        </span>
      ),
    },
    {
      id: 'phase', header: 'Phase',
      cell: ({ row }) => <span className="text-slate-600 text-xs capitalize">{(row.original.details?.phase || 'manual').replace(/_/g, ' ')}</span>,
    },
    {
      id: 'confidence', header: 'Confidence',
      cell: ({ row }) => <span className="text-slate-700 font-semibold text-xs">{row.original.details?.confidence ?? '—'}</span>,
    },
    {
      id: 'status', header: 'Result',
      cell: ({ row }) => row.original.success
        ? <span className="inline-flex items-center gap-1 text-teal-700 font-semibold text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Discovered</span>
        : <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs"><XCircle className="w-3.5 h-3.5" />Failed</span>,
    },
  ];

  const table = useReactTable({ data: logs, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <DiscoveryCandidatesPanel queryClient={queryClient} />

      <PageSection title="Discovery Logs" description="Chronological log of newly registered candidate endpoints and auto-validation results.">
      <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by ATS or board token..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={atsFilter} onValueChange={v => { setAtsFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All ATS Platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ATS Platforms</SelectItem>
            {ATS_OPTIONS.map(a => <SelectItem key={a} value={a}>{SOURCE_LABELS[a]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as any); setPage(1); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Results" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="success">Discovered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/50 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="border-b border-slate-200 hover:bg-transparent">
                {hg.headers.map(h => (
                  <TableHead key={h.id} className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span></div>
              </TableCell></TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-sm text-slate-400">No discovery logs match filters.</TableCell></TableRow>
            ) : table.getRowModel().rows.map(row => (
              <TableRow key={row.id} className="h-10">
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
      </div>
      </PageSection>
    </div>
  );
}

// ── Crawler Logs Tab ────────────────────────────────────────────────────
function CrawlerLogsTab() {
  const [search, setSearch] = useState('');
  const [atsFilter, setAtsFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['crawler-logs', search, atsFilter, eventFilter, page],
    queryFn: () => getCrawlerLogs({ data: { search, ats: atsFilter, eventType: eventFilter, page, pageSize: PAGE_SIZE } }),
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by ATS, token, or details..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={atsFilter} onValueChange={v => { setAtsFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All ATS Platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ATS Platforms</SelectItem>
            {ATS_OPTIONS.map(a => <SelectItem key={a} value={a}>{SOURCE_LABELS[a]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={eventFilter} onValueChange={v => { setEventFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All Event Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Types</SelectItem>
            <SelectItem value="crawl_start">Crawl Start</SelectItem>
            <SelectItem value="crawl_complete">Crawl Complete</SelectItem>
            <SelectItem value="dedup_merge">Dedup Merge</SelectItem>
            <SelectItem value="vector_insert">Vector Insert</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-4 w-10"></th>
                <th className="px-5 py-4">Time</th>
                <th className="px-5 py-4">Event</th>
                <th className="px-5 py-4">ATS/Token</th>
                <th className="px-5 py-4">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-slate-600">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No crawler logs match filters.</td></tr>
              ) : logs.map((log: CrawlerLogRow) => {
                const isExpanded = !!expandedLogs[log.id];
                let parsedDetails: any = null;
                let detailsSummary = '';
                try { parsedDetails = JSON.parse(log.details); detailsSummary = JSON.stringify(parsedDetails); } catch { detailsSummary = log.details; }
                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => setExpandedLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}>
                      <td className="px-5 py-3">{isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</td>
                      <td suppressHydrationWarning className="px-5 py-3 text-slate-400 text-[10px]">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-3"><EventBadge eventType={log.eventType} /></td>
                      <td className="px-5 py-3">
                        {log.ats ? (
                          <span className="inline-flex items-center gap-1">
                            <AtsBadge ats={log.ats} />
                            <span className="text-slate-400 font-mono text-[10px] truncate max-w-[80px]">{log.boardToken}</span>
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{detailsSummary}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={5} className="px-5 py-4 border-t border-slate-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Event Details (JSON)</h4>
                          <pre className="bg-slate-900 text-slate-200 font-mono text-[10.5px] p-4 rounded-xl overflow-x-auto max-h-60 leading-relaxed shadow-sm">
                            {parsedDetails ? JSON.stringify(parsedDetails, null, 2) : log.details}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Jobs Tab (merged Agent Insights lifecycle browser + Crawler jobs/boards) ──
const PAGE_SIZE = 25;

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
                  <td className="px-4 py-3"><AtsBadge ats={b.ats} /></td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">{b.token}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{b.company_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{b.crawl_frequency_tier || '—'}</td>
                  <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                    {b.last_crawled_at ? new Date(b.last_crawled_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold ${b.crawl_error_count > 0 ? 'text-red-600' : 'text-slate-400'}`}>{b.crawl_error_count || 0}</span>
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
      {totalPages > 1 && (
        <div className="border-t border-slate-100 px-4 py-3 bg-white/40 rounded-2xl">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function JobDetailTable({ filter, subFilter, search }: { filter: FilterKey; subFilter: string | null; search: string }) {
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['agents-admin-jobs', filter, subFilter, search, page],
    queryFn: () => getAgentInsightsJobs({ data: { filter, subFilter, page, pageSize: PAGE_SIZE } }),
  });

  React.useEffect(() => { setPage(1); setExpandedRows({}); }, [filter, subFilter, search]);

  const isBoardsFilter = filter === 'boards';
  const allJobs: JobDetailRow[] = (!isBoardsFilter && data?.jobs) ? data.jobs : [];
  const jobs = search
    ? allJobs.filter(j =>
        j.companyDisplay.toLowerCase().includes(search.toLowerCase()) ||
        j.titleDisplay.toLowerCase().includes(search.toLowerCase()))
    : allJobs;
  const boards: any[] = (isBoardsFilter && (data as any)?.boards) ? (data as any).boards : [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">
        <Loader2 className="w-5 h-5 animate-spin mr-3" /> Loading...
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
        {subFilter && <span className="ml-1 text-slate-400">· <span className="text-orange-600 font-bold">{SOURCE_LABELS[subFilter] || subFilter}</span></span>}
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
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No jobs found.</td></tr>
              ) : jobs.map((job: JobDetailRow) => {
                const isExpanded = !!expandedRows[job.id];
                const showJson = !!showRawJson[job.id];
                return (
                  <React.Fragment key={job.id}>
                    <tr className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => setExpandedRows(prev => ({ ...prev, [job.id]: !prev[job.id] }))}>
                      <td className="px-4 py-3">{isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-primary-50 text-primary-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-primary-200 max-w-[140px] truncate">
                          {job.companyDisplay}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 max-w-[200px]"><span className="truncate block">{job.titleDisplay}</span></td>
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        <span className="truncate block max-w-[120px]">{job.locationDisplay || (job.remote ? 'Remote' : '—')}</span>
                        {job.remote && <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded font-bold uppercase">Remote</span>}
                      </td>
                      <td className="px-4 py-3"><AtsBadge ats={job.ats} /></td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] font-semibold">{job.sourceCount > 0 ? `${job.sourceCount} source${job.sourceCount !== 1 ? 's' : ''}` : '—'}</td>
                      <td className="px-4 py-3">
                        {job.isExpired
                          ? <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Expired</span>
                          : <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Active</span>}
                      </td>
                      <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">{job.firstSeenAt ? new Date(job.firstSeenAt).toLocaleDateString() : '—'}</td>
                      <td suppressHydrationWarning className="px-4 py-3 text-slate-400 font-mono text-[10px]">{job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleDateString() : '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={9} className="px-5 py-5 border-t border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Job Description</h4>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-56 overflow-y-auto text-slate-600 font-medium leading-relaxed whitespace-pre-wrap text-[11px]">
                                  {cleanJobDescription(job.descriptionPlain || '') || <span className="text-slate-300 italic">No description available</span>}
                                </div>
                              </div>
                              {job.allSources.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">ATS Sources ({job.allSources.length})</h4>
                                  <div className="space-y-2">
                                    {job.allSources.map((s, i) => (
                                      <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-2">
                                            <AtsBadge ats={s.ats} />
                                            <span className="text-[10px] font-mono text-slate-500">{s.boardToken}</span>
                                            <span className="text-[10px] text-slate-400">Job ID: {s.sourceJobId}</span>
                                          </div>
                                          <div suppressHydrationWarning className="text-[10px] text-slate-400 font-mono">
                                            First: {new Date(s.firstSeenAt).toLocaleDateString()} · Last: {new Date(s.lastSeenAt).toLocaleDateString()}
                                          </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                          {s.sourceUrl && (
                                            <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-slate-500 hover:text-primary-600 underline inline-flex items-center gap-0.5">
                                              <Globe className="h-3 w-3" /> Source <ArrowRight className="h-3 w-3" />
                                            </a>
                                          )}
                                          {s.applyUrl && (
                                            <a href={s.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-teal-600 hover:text-teal-800 underline">
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
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Job Metadata</h4>
                                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {job.employmentType && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.employmentType}</span>}
                                    {job.experienceLevel && <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium capitalize">{job.experienceLevel}</span>}
                                    {job.department && <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.department}</span>}
                                    {job.team && <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">{job.team}</span>}
                                    {job.remote && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase">Remote</span>}
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
                                  {job.firstSeenAt && <div className="flex justify-between"><span className="text-slate-400">First Seen</span><span suppressHydrationWarning className="text-slate-700">{new Date(job.firstSeenAt).toLocaleString()}</span></div>}
                                  {job.lastSeenAt && <div className="flex justify-between"><span className="text-slate-400">Last Seen</span><span suppressHydrationWarning className="text-slate-700">{new Date(job.lastSeenAt).toLocaleString()}</span></div>}
                                  {job.expiresAt && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Expires</span>
                                      <span suppressHydrationWarning className={`font-bold ${job.isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                                        {new Date(job.expiresAt).toLocaleString()}{job.isExpired && ' (expired)'}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between"><span className="text-slate-400">Dedup Key</span><span className="text-slate-500 truncate max-w-[200px]">{job.dedupKey}</span></div>
                                </div>
                              </div>
                              <div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowRawJson(prev => ({ ...prev, [job.id]: !prev[job.id] })); }}
                                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 flex items-center gap-1 transition cursor-pointer"
                                >
                                  {showJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Raw JSON
                                </button>
                                {showJson && (
                                  <pre className="mt-2 bg-slate-900 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto max-h-56 leading-relaxed shadow-sm">
                                    {JSON.stringify({
                                      id: job.id, dedupKey: job.dedupKey, company: job.companyDisplay, title: job.titleDisplay,
                                      location: job.locationDisplay, remote: job.remote, employmentType: job.employmentType,
                                      experienceLevel: job.experienceLevel, department: job.department, team: job.team,
                                      compensation: { min: job.compensationMin, max: job.compensationMax, currency: job.compensationCurrency },
                                      firstSeenAt: job.firstSeenAt, lastSeenAt: job.lastSeenAt, expiresAt: job.expiresAt,
                                      isExpired: job.isExpired, sources: job.allSources,
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

      {totalPages > 1 && (
        <div className="border-t border-slate-100 px-4 py-3 bg-white/40 rounded-2xl">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function JobsTab({ overview }: { overview: ReturnType<typeof useOverviewData> }) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('total');
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  function handleFilterClick(f: FilterKey) {
    if (activeFilter === f) return;
    setActiveFilter(f);
    setSubFilter(null);
  }
  function handleSubFilterClick(val: string) {
    setSubFilter(prev => prev === val ? null : val);
  }

  const d = overview.data;

  const statTiles = [
    { key: 'total' as FilterKey, title: 'Total Jobs', value: d.totalJobs, activeBorder: 'border-slate-700', activeBg: 'bg-slate-50' },
    { key: 'active' as FilterKey, title: 'Active Jobs', value: d.activeJobs, activeBorder: 'border-teal-500', activeBg: 'bg-teal-50' },
    { key: 'expired' as FilterKey, title: 'Expired Jobs', value: d.expiredJobs, activeBorder: 'border-red-400', activeBg: 'bg-red-50' },
    { key: 'crawler' as FilterKey, title: 'Crawler Jobs', value: d.crawlerJobs, activeBorder: 'border-blue-500', activeBg: 'bg-blue-50' },
    { key: 'manual' as FilterKey, title: 'Manual / Other', value: d.manualJobs, activeBorder: 'border-orange-400', activeBg: 'bg-orange-50' },
    { key: 'boards' as FilterKey, title: 'Active Boards', value: d.activeBoards, activeBorder: 'border-purple-500', activeBg: 'bg-purple-50' },
  ];

  const tier2Config: { title: string; entries: { label: string; value: string; count: number }[] } | null = (() => {
    if (activeFilter === 'crawler' || activeFilter === 'total' || activeFilter === 'active' || activeFilter === 'expired') {
      const map = activeFilter === 'crawler' ? overview.data.jobsByAts : overview.data.jobsByAts;
      const entries = (Object.entries(map) as [string, number][]).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
      if (entries.length === 0) return null;
      return { title: 'Breakdown by ATS', entries };
    }
    if (activeFilter === 'boards') {
      const entries = (Object.entries(overview.data.boardsByAts) as [string, number][]).map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: k, count: v }));
      if (entries.length === 0) return null;
      return { title: 'Boards by ATS', entries };
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statTiles.map(tile => {
          const isActive = activeFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => handleFilterClick(tile.key)}
              className={`text-left rounded-xl border-2 p-3 transition cursor-pointer shadow-sm ${isActive ? `${tile.activeBorder} ${tile.activeBg} shadow-md` : 'border-transparent bg-white/80 hover:border-slate-200 hover:shadow'}`}
            >
              <div className="text-xl font-bold text-slate-900">{tile.value.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-slate-700 mt-0.5">{tile.title}</div>
            </button>
          );
        })}
      </div>

      {tier2Config && (
        <div className="bg-white/70 border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{tier2Config.title}</h3>
            {subFilter && (
              <button type="button" onClick={() => setSubFilter(null)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer">
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
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${subFilter === entry.value ? 'bg-orange-600 text-white border-orange-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:text-orange-700 shadow-sm'}`}
              >
                <span className="capitalize">{entry.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${subFilter === entry.value ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {entry.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeFilter !== 'boards' && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by company or job title..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 max-w-md" />
        </div>
      )}

      <JobDetailTable filter={activeFilter} subFilter={subFilter} search={search} />
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────
function useOverviewData() {
  const loaderData = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ['agents-admin-overview'],
    queryFn: () => getAgentsAdminOverview({ data: {} }),
    initialData: loaderData,
  });
  return { data: data! };
}

function OverviewTab({ overview }: { overview: ReturnType<typeof useOverviewData> }) {
  const d = overview.data;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white/80 shadow-sm overflow-hidden grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-slate-100">
        <StatTile label="Total Boards" value={d.totalBoards} />
        <StatTile label="Validated Boards" value={d.validatedBoards} color="text-teal-600" />
        <StatTile label="Active Boards" value={d.activeBoards} color="text-indigo-600" />
        <StatTile label="New This Week" value={`+${d.discoveredLastWeek}`} color="text-orange-600" />
        <StatTile label="False Positives" value={`${(d.falsePositiveRate * 100).toFixed(1)}%`} color="text-amber-600" />
        <StatTile label="Canonical Jobs" value={d.canonicalJobs} desc="Deduplicated postings" />
        <StatTile label="Job Sources" value={d.sourceCount} desc="Source mappings" />
        <StatTile label="Crawls (24h)" value={d.crawls24h} desc="Completed crawls" />
        <StatTile label="LLM Runs (24h)" value={d.llmCalls24h} desc="Fuzzy match checks" />
        <StatTile label="Errors (24h)" value={d.errors24h} color={d.errors24h > 0 ? 'text-red-600' : undefined} desc="Crawl failures" />
        <StatTile label="Active Jobs" value={d.activeJobs} color="text-teal-600" desc="Not expired" />
        <StatTile label="Expired Jobs" value={d.expiredJobs} color="text-red-600" desc="Past expires_at" />
      </div>

      <SourceHealthPanel jobsByAts={d.jobsByAts} boardsByAts={d.boardsByAts} crawlsByAts={d.crawlsByAts} errorsByAts={d.errorsByAts} />
    </div>
  );
}

// ── Discovery Boards mini-table (within Discovery Logs tab context, optional) ──

// ── Manual Actions Card ─────────────────────────────────────────────────
function ManualActionsCard({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBoardAts, setNewBoardAts] = useState('greenhouse');
  const [newBoardToken, setNewBoardToken] = useState('');
  const [newBoardCompany, setNewBoardCompany] = useState('');

  const triggerDiscoveryMutation = useMutation({
    mutationFn: async () => {
      const toastId = toast.loading('Enqueuing discovery phases…', { duration: Infinity });
      const res = await fetch('/api/discovery/cron?bypass=true', { method: 'POST' });
      const data = await res.json() as any;
      if (!data.success) {
        toast.error('Failed to trigger discovery cron', { id: toastId, duration: 5000 });
        throw new Error(data.error || 'Failed to trigger cron');
      }
      toast.success('All discovery phases enqueued', { id: toastId, description: 'Workers are processing in the background', duration: 5000 });
      return data;
    },
    onError: (err: any) => toast.error(err.message || 'Error triggering discovery cron', { duration: 5000 }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents-admin-overview'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-logs'] });
    },
  });

  const triggerCrawlerMutation = useMutation({
    mutationFn: async () => {
      const toastId = toast.loading('Running crawler scheduler…', { duration: Infinity });
      const res = await fetch('/api/crawl/cron?force=true', { method: 'POST' });
      const data = await res.json() as any;
      if (!data.success) {
        toast.error(data.error || 'Cron trigger failed', { id: toastId, duration: 5000 });
        throw new Error(data.error || 'Cron trigger failed');
      }
      toast.success('Crawler cron triggered', { id: toastId, description: data.message, duration: 5000 });
      return data;
    },
    onError: (err: any) => toast.error(err.message || 'Error triggering crawler cron', { duration: 5000 }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents-admin-overview'] });
      queryClient.invalidateQueries({ queryKey: ['crawler-logs'] });
    },
  });

  const addBoardMutation = useMutation({
    mutationFn: async ({ ats, token, companyName }: { ats: string; token: string; companyName?: string }) => {
      const res = await fetch('/api/crawl/save-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ats, token, companyName }),
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to add board');
      return data;
    },
    onSuccess: () => {
      toast.success('Board successfully added!');
      setNewBoardToken('');
      setNewBoardCompany('');
      setIsAddModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Error adding board'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agents-admin-overview'] }),
  });

  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardToken.trim()) { toast.error('Board token is required'); return; }
    addBoardMutation.mutate({ ats: newBoardAts, token: newBoardToken, companyName: newBoardCompany });
  };

  const isPending = triggerDiscoveryMutation.isPending || triggerCrawlerMutation.isPending;

  return (
    <PageSection title="Manual Actions" description="Trigger discovery and crawler runs on demand, or register a new ATS board.">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => triggerDiscoveryMutation.mutate()} disabled={isPending}>
          <Play className={`h-4 w-4 ${triggerDiscoveryMutation.isPending ? 'animate-spin' : ''}`} />
          Run Discovery
        </Button>
        <Button onClick={() => triggerCrawlerMutation.mutate()} disabled={isPending} variant="secondary">
          <Play className={`h-4 w-4 ${triggerCrawlerMutation.isPending ? 'animate-spin' : ''}`} />
          Run Crawler
        </Button>
        <Button onClick={() => setIsAddModalOpen(true)} variant="outline">
          <Plus className="h-4 w-4" />
          Add Board
        </Button>
      </div>

      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => { setIsAddModalOpen(false); setNewBoardToken(''); setNewBoardCompany(''); }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-100" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2"><Plus size={18} className="text-primary-600" /><h2 className="font-bold text-slate-900">Add Target Board</h2></div>
              <button onClick={() => { setIsAddModalOpen(false); setNewBoardToken(''); setNewBoardCompany(''); }} className="p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleAddBoard} className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="ats" className="text-xs font-bold uppercase tracking-wider text-slate-500">Applicant Tracking System (ATS)</label>
                  <select id="ats" value={newBoardAts} onChange={e => setNewBoardAts(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                    <optgroup label="ATS Platforms">
                      <option value="greenhouse">Greenhouse</option>
                      <option value="lever">Lever</option>
                      <option value="ashby">Ashby</option>
                      <option value="workable">Workable</option>
                    </optgroup>
                    <optgroup label="Catalog Aggregators">
                      <option value="remoteok">RemoteOK</option>
                      <option value="himalayas">Himalayas</option>
                      <option value="jobicy">Jobicy</option>
                    </optgroup>
                    <optgroup label="Search Aggregators">
                      <option value="adzuna">Adzuna</option>
                      <option value="jooble">Jooble</option>
                      <option value="remotive">Remotive</option>
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="token" className="text-xs font-bold uppercase tracking-wider text-slate-500">Board Token / Slug</label>
                  <input id="token" type="text" required placeholder={newBoardAts === 'greenhouse' ? 'e.g., figma' : newBoardAts === 'lever' ? 'e.g., vercel' : 'e.g., linear'} value={newBoardToken} onChange={e => setNewBoardToken(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="company" className="text-xs font-bold uppercase tracking-wider text-slate-500">Company Name</label>
                  <input id="company" type="text" placeholder="e.g., Figma" value={newBoardCompany} onChange={e => setNewBoardCompany(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 flex-shrink-0">
                <button type="button" onClick={() => { setIsAddModalOpen(false); setNewBoardToken(''); setNewBoardCompany(''); }} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={addBoardMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-sm">
                  {addBoardMutation.isPending ? 'Adding...' : 'Add Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageSection>
  );
}

// ── Root Dashboard ──────────────────────────────────────────────────────
function AgentsAdminDashboard() {
  const queryClient = useQueryClient();
  const overview = useOverviewData();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'discovery-logs', label: 'Discovery Logs' },
    { key: 'crawler-logs', label: 'Crawler Logs' },
    { key: 'jobs', label: 'Jobs' },
  ];

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Operations"
        icon={<Bot className="h-3.5 w-3.5" />}
        title="Agents Admin"
        description="Unified discovery, crawler, and catalog health for Greenhouse, Lever, Ashby, Workable, and aggregator sources."
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await queryClient.invalidateQueries();
              toast.success('Data refreshed');
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ManualActionsCard queryClient={queryClient} />

      <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${activeTab === tab.key ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab overview={overview} />}
      {activeTab === 'discovery-logs' && <DiscoveryLogsTab queryClient={queryClient} />}
      {activeTab === 'crawler-logs' && <CrawlerLogsTab />}
      {activeTab === 'jobs' && <JobsTab overview={overview} />}
    </div>
  );
}

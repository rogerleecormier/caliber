import { useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Search,
  RefreshCw,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { PageHero, PageSection } from '@caliber/ui-kit';
import { toast } from 'sonner';
import { getDiscoveryStats } from '@/server/functions/discovery';

export const Route = createFileRoute('/discovery')({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
    if (ctx.user.role !== "admin") throw redirect({ to: "/" });
  },
  loader: async () => {
    return getDiscoveryStats();
  },
  component: DiscoveryDashboard
});

function DiscoveryDashboard() {
  const queryClient = useQueryClient();
  const loaderData = Route.useLoaderData() as any;

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [atsFilter, setAtsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [boardPage, setBoardPage] = useState(0);
  const PAGE_SIZE = 10;

  // mutations for discovery actions
  const runPhaseMutation = useMutation({
    mutationFn: async (phase: string) => {
      const phaseLabels: Record<string, string> = {
        company_lists: 'Company Lists',
        llm_inference: 'LLM Inference',
        aggregators: 'Aggregators',
        search_engine: 'Search Engines',
        job_feeds: 'Job Feeds',
      };
      const label = phaseLabels[phase] ?? phase;
      const toastId = toast.loading(`Enqueuing ${label} phase…`, { duration: Infinity });
      const res = await fetch(`/api/discovery/run-phase?phase=${phase}`, { method: 'POST' });
      const data = await res.json() as any;
      if (!data.success) {
        toast.dismiss(toastId);
        throw new Error(data.error || `Phase ${phase} failed`);
      }
      toast.success(`${label} phase enqueued`, {
        id: toastId,
        description: 'Worker will process it in the background',
        duration: 5000,
      });
      return data;
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error triggering discovery phase');
    }
  });

  const triggerCronMutation = useMutation({
    mutationFn: async () => {
      const toastId = toast.loading('Starting discovery cron…', { duration: Infinity });

      const phaseLabels: Record<string, string> = {
        company_lists: 'Company Lists',
        llm_inference: 'LLM Inference',
        aggregators: 'Aggregators',
        search_engine: 'Search Engines',
        job_feeds: 'Job Feeds',
      };

      const phases = ['company_lists', 'llm_inference', 'aggregators', 'search_engine', 'job_feeds'];
      const enqueued: string[] = [];

      for (const phase of phases) {
        await new Promise(r => setTimeout(r, 120));
        enqueued.push(phase);
        const remaining = phases.slice(enqueued.length);
        const lines = [
          ...enqueued.map(p => `✓ ${phaseLabels[p]}`),
          ...remaining.map(p => `○ ${phaseLabels[p]}`),
        ].join('\n');
        toast.loading(
          <span className="whitespace-pre font-mono text-xs leading-relaxed">{lines}</span>,
          { id: toastId, description: `Enqueuing phase ${enqueued.length} of ${phases.length}…` }
        );
      }

      const res = await fetch('/api/discovery/cron?bypass=true', { method: 'POST' });
      const data = await res.json() as any;
      if (!data.success) {
        toast.dismiss(toastId);
        throw new Error(data.error || 'Failed to trigger cron');
      }

      toast.success(
        <span className="whitespace-pre font-mono text-xs leading-relaxed">
          {phases.map(p => `✓ ${phaseLabels[p]}`).join('\n')}
        </span>,
        { id: toastId, description: 'All 5 discovery phases enqueued — workers processing in background', duration: 8000 }
      );

      return data;
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error triggering discovery cron');
    }
  });

  const validateBoardMutation = useMutation({
    mutationFn: async (boardId: string) => {
      const res = await fetch('/api/discovery/validate-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId })
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Validation request failed');
      return data;
    },
    onMutate: async (boardId) => {
      await queryClient.cancelQueries({ queryKey: ['discovery-data'] });
      const previousData = queryClient.getQueryData<any>(['discovery-data']);

      if (previousData) {
        queryClient.setQueryData(['discovery-data'], {
          ...previousData,
          boards: previousData.boards.map((b: any) =>
            b.id === boardId ? { ...b, validated: true, validation_error_count: 0 } : b
          )
        });
      }
      return { previousData };
    },
    onSuccess: (data) => {
      if (data.validated) {
        toast.success('Board token validated — active crawl enabled');
      } else {
        toast.error('Board validation failed. Check endpoint validity.');
      }
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['discovery-data'], context.previousData);
      }
      toast.error(err.message || 'Error validating board');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-data'] });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ boardId, nextActive }: { boardId: string; nextActive: boolean }) => {
      const res = await fetch('/api/crawl/toggle-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId, is_active: nextActive })
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to toggle board status');
      return data;
    },
    onMutate: async ({ boardId, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ['discovery-data'] });
      const previousData = queryClient.getQueryData<any>(['discovery-data']);

      if (previousData) {
        queryClient.setQueryData(['discovery-data'], {
          ...previousData,
          boards: previousData.boards.map((b: any) =>
            b.id === boardId ? { ...b, is_active: nextActive ? 1 : 0 } : b
          ),
          stats: {
            ...previousData.stats,
            active_boards: Math.max(0, (previousData.stats?.active_boards || 0) + (nextActive ? 1 : -1))
          }
        });
      }
      return { previousData };
    },
    onSuccess: () => {
      toast.success('Crawler board status updated');
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['discovery-data'], context.previousData);
      }
      toast.error(err.message || 'Error updating board status');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-data'] });
    }
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async (boardId: string) => {
      const res = await fetch('/api/discovery/delete-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId })
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to delete board');
      return data;
    },
    onMutate: async (boardId) => {
      await queryClient.cancelQueries({ queryKey: ['discovery-data'] });
      const previousData = queryClient.getQueryData<any>(['discovery-data']);

      if (previousData) {
        const deletedBoard = previousData.boards.find((b: any) => b.id === boardId);

        queryClient.setQueryData(['discovery-data'], {
          ...previousData,
          boards: previousData.boards.filter((b: any) => b.id !== boardId),
          stats: {
            ...previousData.stats,
            total_boards: Math.max(0, (previousData.stats?.total_boards || 0) - 1),
            active_boards: deletedBoard?.is_active === 1
              ? Math.max(0, (previousData.stats?.active_boards || 0) - 1)
              : (previousData.stats?.active_boards || 0),
            validated_boards: deletedBoard?.validated === true
              ? Math.max(0, (previousData.stats?.validated_boards || 0) - 1)
              : (previousData.stats?.validated_boards || 0)
          }
        });
      }
      return { previousData };
    },
    onSuccess: () => {
      toast.success('Board removed from discovery results');
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['discovery-data'], context.previousData);
      }
      toast.error(err.message || 'Error deleting board');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-data'] });
    }
  });

  const isAnyMutationPending =
    runPhaseMutation.isPending ||
    triggerCronMutation.isPending ||
    validateBoardMutation.isPending ||
    toggleActiveMutation.isPending ||
    deleteBoardMutation.isPending;

  const { data } = useQuery({
    queryKey: ['discovery-data'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/stats');
      const json = await res.json() as any;
      return {
        stats: {
          total_boards: json.total_boards ?? 0,
          validated_boards: json.validated_boards ?? 0,
          active_boards: json.active_boards ?? 0,
          discovered_last_week: json.discovered_last_week ?? 0,
          by_phase: json.by_phase ?? [],
          false_positive_rate: json.false_positive_rate ?? 0,
        },
        boards: json.boards ?? [],
        logs: json.recent_audit ?? [],
      };
    },
    initialData: loaderData,
    refetchInterval: (autoRefresh && !isAnyMutationPending) ? 30000 : false,
  });

  const { stats, boards, logs } = data || {
    stats: { total_boards: 0, validated_boards: 0, active_boards: 0, discovered_last_week: 0, by_phase: [], false_positive_rate: 0 },
    boards: [],
    logs: []
  };

  const handleRunPhase = (phase: string) => {
    runPhaseMutation.mutate(phase);
  };

  const handleTriggerCron = () => {
    triggerCronMutation.mutate();
  };

  const handleValidateBoard = (boardId: string) => {
    validateBoardMutation.mutate(boardId);
  };

  const handleToggleActive = (boardId: string, currentActive: boolean) => {
    toggleActiveMutation.mutate({ boardId, nextActive: !currentActive });
  };

  const handleDeleteBoard = (boardId: string) => {
    if (!confirm('Are you sure you want to delete this board from discovery results?')) return;
    deleteBoardMutation.mutate(boardId);
  };

  // Filter boards
  const filteredBoards = boards.filter((board: any) => {
    const matchesSearch = !search ||
      board.token.toLowerCase().includes(search.toLowerCase()) ||
      (board.company_name && board.company_name.toLowerCase().includes(search.toLowerCase()));
    const matchesAts = atsFilter === 'all' || board.ats.toLowerCase() === atsFilter.toLowerCase();
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'validated' && board.validated) ||
      (statusFilter === 'unvalidated' && !board.validated);
    return matchesSearch && matchesAts && matchesStatus;
  });

  const getAtsBadgeColor = (ats: string) => {
    switch (ats.toLowerCase()) {
      case 'greenhouse': return 'bg-green-50 text-green-700 border-green-200';
      case 'lever': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ashby': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'workable': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getPhaseName = (phase: string) => {
    switch (phase) {
      case 'company_lists': return 'Company Lists';
      case 'llm_inference': return 'LLM Inference';
      case 'aggregators': return 'Aggregator APIs';
      case 'search_engine': return 'Search Engines';
      case 'job_feeds': return 'Job Feeds';
      default: return 'Manual';
    }
  };

  const pageCount = Math.ceil(filteredBoards.length / PAGE_SIZE);
  const pagedBoards = filteredBoards.slice(boardPage * PAGE_SIZE, (boardPage + 1) * PAGE_SIZE);

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Automation"
        icon={<Shield className="h-3.5 w-3.5" />}
        title="Board Discovery"
        description="Auto-discover, validate, and index Greenhouse, Lever, Ashby, and Workable ATS boards dynamically."
        actions={
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 cursor-pointer shadow-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              Auto-refresh
            </label>
            <button
              onClick={async () => {
                await queryClient.invalidateQueries({ queryKey: ['discovery-data'] });
                toast.success('Discovery data refreshed');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={handleTriggerCron}
              disabled={isAnyMutationPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Play className={`h-4 w-4 ${triggerCronMutation.isPending ? 'animate-spin' : ''}`} />
              Run Discovery Cron
            </button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Discovered</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Validated Boards</div>
          <div className="text-2xl font-bold text-green-600">{stats.validated_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Active Crawlers</div>
          <div className="text-2xl font-bold text-blue-600">{stats.active_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">New This Week</div>
          <div className="text-2xl font-bold text-indigo-600">+{stats.discovered_last_week}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">False Positives</div>
          <div className="text-2xl font-bold text-amber-600">{(stats.false_positive_rate * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Discovery Phase Controllers */}
      <PageSection
        title="Phase Controllers"
        description="Execute board crawler pipeline phases on demand to pull new candidates."
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { id: 'company_lists', name: 'Seed Lists', desc: 'S&P 500, YC & Crunchbase lists with DNS probing.' },
            { id: 'llm_inference', name: 'LLM Inference', desc: 'Workers AI Llama-3 guesses likely board tokens.' },
            { id: 'aggregators', name: 'Aggregators', desc: 'Fantastic.jobs & TheirStack tech registry sync.' },
            { id: 'search_engine', name: 'Search Engines', desc: 'Google dorks indexing boards.' },
            { id: 'job_feeds', name: 'Job Feeds', desc: 'Indeed & ZipRecruiter job redirect scans.' }
          ].map(phase => (
            <div key={phase.id} className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 bg-white/60 shadow-sm transition hover:shadow-md">
              <div>
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-500" />
                  {phase.name}
                </h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{phase.desc}</p>
              </div>
              <button
                onClick={() => handleRunPhase(phase.id)}
                disabled={isAnyMutationPending}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition cursor-pointer"
              >
                <Play className={`w-3.5 h-3.5 ${runPhaseMutation.isPending && runPhaseMutation.variables === phase.id ? 'animate-spin' : ''}`} />
                Run Phase
              </button>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Filters & Discovered Boards */}
      <PageSection
        title="Candidates Database"
        description="Explore recently discovered ATS board tokens, validate status, and approve crawler tracking."
        actions={
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            Showing {filteredBoards.length} candidates
          </span>
        }
      >
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company or token name..."
              value={search}
              onChange={e => { setSearch(e.target.value); setBoardPage(0); }}
              className="pl-9 pr-4 py-2 w-full border border-slate-200 bg-white/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={atsFilter}
              onChange={e => { setAtsFilter(e.target.value); setBoardPage(0); }}
              className="px-3 py-2 border border-slate-200 bg-white/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition shadow-sm"
            >
              <option value="all">All ATS Platforms</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="workable">Workable</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setBoardPage(0); }}
              className="px-3 py-2 border border-slate-200 bg-white/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition shadow-sm"
            >
              <option value="all">All Validation Statuses</option>
              <option value="validated">Validated</option>
              <option value="unvalidated">Unvalidated</option>
            </select>
          </div>
        </div>

        {/* Boards Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Company</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">ATS</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Token</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Confidence</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Discovery Phase</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pagedBoards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                    No discovered boards match filters.
                  </td>
                </tr>
              ) : pagedBoards.map((board: any) => (
                <tr key={board.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 align-middle text-sm font-normal">
                    {board.company_name || board.token.charAt(0).toUpperCase() + board.token.slice(1)}
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    <span className={`px-2 py-0.5 border text-xs font-semibold rounded-md ${getAtsBadgeColor(board.ats)}`}>
                      {board.ats}
                    </span>
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    <span className="font-mono text-xs text-slate-700">{board.token}</span>
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    <span className="font-semibold text-slate-900">{board.discovery_confidence ?? 0.7}</span>
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    {getPhaseName(board.discovery_phase)}
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    {board.validated ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-semibold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Validated
                      </span>
                    ) : board.validation_error_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs" title={`${board.validation_error_count} validation failures`}>
                        <XCircle className="w-3.5 h-3.5" />
                        Failed ({board.validation_error_count})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-medium text-xs">
                        <HelpCircle className="w-3.5 h-3.5" />
                        Unchecked
                      </span>
                    )}
                  </td>
                  <td className="p-4 align-middle text-sm font-normal">
                    <div className="flex items-center justify-end gap-1.5">
                      {!board.validated && (
                        <button
                          onClick={() => handleValidateBoard(board.id)}
                          disabled={isAnyMutationPending}
                          className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition cursor-pointer"
                        >
                          Validate
                        </button>
                      )}
                      {board.validated && (
                        <button
                          onClick={() => handleToggleActive(board.id, board.is_active === 1)}
                          disabled={isAnyMutationPending}
                          className={`px-2 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                            board.is_active === 1
                              ? 'text-red-700 bg-red-50 hover:bg-red-100'
                              : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                          }`}
                        >
                          {board.is_active === 1 ? 'Pause' : 'Activate'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteBoard(board.id)}
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

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-4 mt-4">
            <span className="text-xs text-slate-500 font-semibold">
              Page {boardPage + 1} of {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBoardPage(p => Math.max(0, p - 1))}
                disabled={boardPage === 0}
                className="p-1.5 border border-slate-200 bg-white rounded-lg text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setBoardPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={boardPage >= pageCount - 1}
                className="p-1.5 border border-slate-200 bg-white rounded-lg text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </PageSection>

      {/* Discovery Audit Trails */}
      <PageSection
        title="Recent Discovery Logs"
        description="Chronological log of newly registered candidate endpoints and auto-validation results."
      >
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white/50 max-h-[300px] overflow-y-auto">
          <div className="p-3 bg-slate-900 text-slate-300 font-mono text-xs divide-y divide-slate-800">
            {logs.map((log: any) => {
              let details: any = {};
              try {
                details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
              } catch (e) {}

              const isSuccess = log.event_type === 'board_discovered';

              return (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <span suppressHydrationWarning className="text-slate-500 font-medium">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
                    <span className={`${isSuccess ? 'text-green-400' : 'text-red-400'} font-semibold`}>
                      {log.ats}:{log.board_token}
                    </span>{' '}
                    {isSuccess ? (
                      <>
                        discovered via{' '}
                        <span className="text-indigo-400 font-semibold">{getPhaseName(details.phase)}</span>{' '}
                        with <span className="text-yellow-400 font-semibold">{details.confidence}</span> confidence.
                      </>
                    ) : (
                      <>
                        validation <span className="text-red-400 font-semibold">failed</span> checking{' '}
                        <span className="text-indigo-400 font-semibold">{getPhaseName(details.phase)}</span> candidate
                      </>
                    )}
                  </div>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 shrink-0 font-sans uppercase tracking-wider">
                    {log.actor}
                  </span>
                </div>
              );
            })}
            {logs.length === 0 && (
              <div className="p-4 text-center text-slate-500 font-medium">
                No discovery logs recorded.
              </div>
            )}
          </div>
        </div>
      </PageSection>
    </div>
  );
}

import { useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  Shield,
  Search,
  RefreshCw,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Database,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { PageHero, PageSection } from '@caliber/ui-kit';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/discovery')({
  loader: async () => {
    try {
      const env = await getCloudflareEnvAsync();
      const db = env.DB;
      if (!db) {
        return {
          stats: { total_boards: 0, validated_boards: 0, active_boards: 0, discovered_last_week: 0, by_phase: [], false_positive_rate: 0 },
          boards: [],
          logs: []
        };
      }

      // 1. Fetch total boards, validated, active, discovered last week
      const overallStats = await db.prepare(`
        SELECT
          COUNT(id) as total_boards,
          SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated_boards,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_boards,
          SUM(CASE WHEN datetime(discovered_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as discovered_last_week
        FROM boards
      `).first<any>();

      // 2. Group by discovery phase
      const phaseStats = await db.prepare(`
        SELECT
          COALESCE(discovery_phase, 'manual') as phase,
          COUNT(id) as count,
          ROUND(AVG(discovery_confidence), 2) as avg_confidence
        FROM boards
        GROUP BY discovery_phase
      `).all<any>();

      // 3. False positive rate in past week
      const failureStats = await db.prepare(`
        SELECT
          SUM(CASE WHEN validation_error_count > 0 THEN 1 ELSE 0 END) as validation_failures,
          COUNT(id) as total_count
        FROM boards
        WHERE datetime(discovered_at) > datetime('now', '-7 days')
      `).first<any>();

      const totalCount = failureStats?.total_count ?? 1;
      const validationFailures = failureStats?.validation_failures ?? 0;
      const falsePositiveRate = totalCount > 0 ? (validationFailures / totalCount) : 0;

      // 4. Fetch discovered boards
      const { results: boards } = await db.prepare(`
        SELECT * FROM boards 
        WHERE last_discovered_at IS NOT NULL OR discovery_phase IS NOT NULL OR validated = 1
        ORDER BY last_discovered_at DESC, discovered_at DESC 
        LIMIT 100
      `).all<any>();

      // 5. Fetch audit logs
      const { results: logs } = await db.prepare(`
        SELECT * FROM audit_log 
        WHERE event_type = 'board_discovered' 
        ORDER BY created_at DESC 
        LIMIT 20
      `).all<any>();

      return {
        stats: {
          total_boards: overallStats?.total_boards ?? 0,
          validated_boards: overallStats?.validated_boards ?? 0,
          active_boards: overallStats?.active_boards ?? 0,
          discovered_last_week: overallStats?.discovered_last_week ?? 0,
          by_phase: phaseStats.results ?? [],
          false_positive_rate: Number(falsePositiveRate.toFixed(4))
        },
        boards: boards || [],
        logs: logs || []
      };
    } catch (e) {
      console.error('[discovery-loader] Error loading discovery data:', e);
      return {
        stats: { total_boards: 0, validated_boards: 0, active_boards: 0, discovered_last_week: 0, by_phase: [], false_positive_rate: 0 },
        boards: [],
        logs: []
      };
    }
  },
  component: DiscoveryDashboard
});

function DiscoveryDashboard() {
  const router = useRouter();
  const loaderData = Route.useLoaderData() as any;
  const { stats, boards: initialBoards, logs: initialLogs } = loaderData;

  const [boards, setBoards] = useState<any[]>(initialBoards);
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [atsFilter, setAtsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Trigger discovery phase
  const handleRunPhase = async (phase: string) => {
    setRunningAction(phase);
    showStatus(`Running discovery phase: ${phase}...`, 'info');
    try {
      const res = await fetch(`/api/discovery/run-phase?phase=${phase}&direct=true`, {
        method: 'POST'
      });
      const data = await res.json() as any;
      if (data.success) {
        showStatus(`Phase ${phase} complete! Boards discovered successfully.`, 'success');
        router.invalidate();
      } else {
        showStatus(data.error || `Phase ${phase} failed`, 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Error triggering discovery phase', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Run full daily enqueuer
  const handleTriggerCron = async () => {
    setRunningAction('all');
    showStatus('Triggering daily discovery cron enqueuer...', 'info');
    try {
      const res = await fetch('/api/discovery/cron?bypass=true', {
        method: 'POST'
      });
      const data = await res.json() as any;
      if (data.success) {
        showStatus('Daily discovery cron triggered successfully! Phases enqueued.', 'success');
        router.invalidate();
      } else {
        showStatus(data.error || 'Failed to trigger cron', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Error triggering cron', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Validate individual board token
  const handleValidateBoard = async (boardId: string) => {
    setRunningAction(`validate-${boardId}`);
    try {
      const res = await fetch('/api/discovery/validate-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId })
      });
      const data = await res.json() as any;
      if (data.success) {
        if (data.validated) {
          showStatus('Board token validated successfully! Active crawl enabled.', 'success');
          setBoards(prev => prev.map(b => b.id === boardId ? { ...b, validated: 1, is_active: 1, validation_error_count: 0 } : b));
        } else {
          showStatus('Board validation failed. Check endpoint validity.', 'error');
          setBoards(prev => prev.map(b => b.id === boardId ? { ...b, validation_error_count: (b.validation_error_count || 0) + 1 } : b));
        }
      } else {
        showStatus(data.error || 'Validation request failed', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Error validating board', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Toggle active status
  const handleToggleActive = async (boardId: string, currentActive: boolean) => {
    setRunningAction(`toggle-${boardId}`);
    try {
      const res = await fetch('/api/crawl/toggle-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId, is_active: !currentActive })
      });
      const data = await res.json() as any;
      if (data.success) {
        setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_active: !currentActive ? 1 : 0 } : b));
        showStatus('Crawler board active status updated.', 'success');
      } else {
        showStatus(data.error || 'Failed to toggle board status', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Error toggling board', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Delete board from database
  const handleDeleteBoard = async (boardId: string) => {
    if (!confirm('Are you sure you want to delete this board from discovery results?')) return;
    setRunningAction(`delete-${boardId}`);
    try {
      const res = await fetch('/api/discovery/delete-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId })
      });
      const data = await res.json() as any;
      if (data.success) {
        setBoards(prev => prev.filter(b => b.id !== boardId));
        showStatus('Board removed from discovery results.', 'success');
      } else {
        showStatus(data.error || 'Failed to delete board', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Error deleting board', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Filter boards
  const filteredBoards = boards.filter(board => {
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

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Automation"
        icon={<Shield className="h-3.5 w-3.5" />}
        title="Board Discovery"
        description="Auto-discover, validate, and index Greenhouse, Lever, Ashby, and Workable ATS boards dynamically."
        actions={
          <button
            onClick={handleTriggerCron}
            disabled={runningAction === 'all'}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${runningAction === 'all' ? 'animate-spin' : ''}`} />
            Run Discovery Cron
          </button>
        }
      />

      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all duration-300 ${
          statusMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {statusMessage.type === 'error' && <XCircle className="w-5 h-5 shrink-0" />}
          {statusMessage.type === 'info' && <RefreshCw className="w-5 h-5 animate-spin shrink-0" />}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Discovered</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Validated Boards</div>
          <div className="text-2xl font-bold text-green-600">{stats.validated_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Active Crawlers</div>
          <div className="text-2xl font-bold text-blue-600">{stats.active_boards}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">New This Week</div>
          <div className="text-2xl font-bold text-indigo-600">+{stats.discovered_last_week}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
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
            <div key={phase.id} className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm shadow-sm transition hover:shadow-md">
              <div>
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-500" />
                  {phase.name}
                </h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{phase.desc}</p>
              </div>
              <button
                onClick={() => handleRunPhase(phase.id)}
                disabled={runningAction !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
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
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-slate-200 bg-white/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={atsFilter}
              onChange={e => setAtsFilter(e.target.value)}
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
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 bg-white/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition shadow-sm"
            >
              <option value="all">All Validation Statuses</option>
              <option value="validated">Validated</option>
              <option value="unvalidated">Unvalidated</option>
            </select>
          </div>
        </div>

        {/* Boards Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm">
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
              {filteredBoards.map(board => (
                <tr key={board.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-semibold text-slate-900 text-sm">
                    {board.company_name || board.token.charAt(0).toUpperCase() + board.token.slice(1)}
                  </td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-0.5 border text-xs font-semibold rounded-md ${getAtsBadgeColor(board.ats)}`}>
                      {board.ats}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-700">{board.token}</td>
                  <td className="p-4 text-sm">
                    <span className="font-semibold text-slate-900">{board.discovery_confidence ?? 0.7}</span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    {getPhaseName(board.discovery_phase)}
                  </td>
                  <td className="p-4 text-sm">
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
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!board.validated && (
                        <button
                          onClick={() => handleValidateBoard(board.id)}
                          disabled={runningAction !== null}
                          className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition cursor-pointer"
                        >
                          Validate
                        </button>
                      )}
                      {board.validated ? (
                        <button
                          onClick={() => handleToggleActive(board.id, board.is_active === 1)}
                          disabled={runningAction !== null}
                          className={`px-2 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                            board.is_active === 1
                              ? 'text-red-700 bg-red-50 hover:bg-red-100'
                              : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                          }`}
                        >
                          {board.is_active === 1 ? 'Pause' : 'Activate'}
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleDeleteBoard(board.id)}
                        disabled={runningAction !== null}
                        className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBoards.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                    No discovered boards match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>

      {/* Discovery Audit Trails */}
      <PageSection
        title="Recent Discovery Logs"
        description="Chronological log of newly registered candidate endpoints and auto-validation results."
      >
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white/50 backdrop-blur-sm max-h-[300px] overflow-y-auto">
          <div className="p-3 bg-slate-900 text-slate-300 font-mono text-xs divide-y divide-slate-800">
            {logs.map((log: any) => {
              let details: any = {};
              try {
                details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
              } catch (e) {}

              return (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <span className="text-slate-500 font-medium">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
                    <span className="text-green-400 font-semibold">{log.ats}:{log.board_token}</span> discovered via{' '}
                    <span className="text-indigo-400 font-semibold">{getPhaseName(details.phase)}</span>{' '}
                    with <span className="text-yellow-400 font-semibold">{details.confidence}</span> confidence.
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

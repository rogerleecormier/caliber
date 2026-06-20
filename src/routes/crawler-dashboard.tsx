import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Briefcase,
  Search,
  Globe,
  Settings,
  Plus,
  RefreshCw,
  AlertCircle,
  Database,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  ToggleLeft,
  ToggleRight,
  Trash2
} from 'lucide-react';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

// Server loader runs queries directly on D1 in Cloudflare worker
export const Route = createFileRoute('/crawler-dashboard')({
  loader: async () => {
    try {
      const env = await getCloudflareEnvAsync();
      const db = env.DB;
      if (!db) {
        return { boards: [], jobs: [], auditLogs: [], stats: { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 } };
      }

      const { results: boards } = await db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all<any>();
      const { results: jobs } = await db.prepare('SELECT * FROM canonical_jobs ORDER BY last_seen_at DESC LIMIT 15').all<any>();
      const { results: auditLogs } = await db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20').all<any>();
      
      const stats = await db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM canonical_jobs) as canonical_count,
          (SELECT COUNT(*) FROM job_sources) as source_count,
          (SELECT COUNT(*) FROM boards WHERE is_active = 1) as active_boards,
          (SELECT COUNT(*) FROM audit_log WHERE event_type = 'error' AND created_at > datetime('now', '-24 hours')) as errors_24h,
          (SELECT COUNT(*) FROM audit_log WHERE event_type = 'llm_call' AND created_at > datetime('now', '-24 hours')) as llm_calls_24h
      `).first() as any;

      // Fetch sources for the jobs
      let jobsWithSources = jobs || [];
      if (jobsWithSources.length > 0) {
        const jobIds = jobsWithSources.map(j => j.id);
        const placeholders = jobIds.map(() => '?').join(',');
        const { results: sources } = await db.prepare(`
          SELECT * FROM job_sources WHERE canonical_id IN (${placeholders})
        `).bind(...jobIds).all<any>();

        for (const job of jobsWithSources) {
          job.sources = (sources || []).filter(s => s.canonical_id === job.id);
        }
      }

      return {
        boards: boards || [],
        jobs: jobsWithSources,
        auditLogs: auditLogs || [],
        stats: stats || { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 }
      };
    } catch (e) {
      console.error('[crawler-dashboard-loader] Error loading data:', e);
      return { boards: [], jobs: [], auditLogs: [], stats: { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 } };
    }
  },
  component: CrawlerDashboard
});

function CrawlerDashboard() {
  const loaderData = Route.useLoaderData() as any;
  const { boards: initialBoards, jobs: initialJobs, auditLogs: initialLogs, stats } = loaderData;

  const [boards, setBoards] = useState<any[]>(initialBoards);
  const [jobs, setJobs] = useState<any[]>(initialJobs);
  const [auditLogs, setAuditLogs] = useState<any[]>(initialLogs);
  const [activeTab, setActiveTab] = useState<'jobs' | 'boards' | 'logs'>('jobs');

  // Form states
  const [newBoardAts, setNewBoardAts] = useState<'greenhouse' | 'lever' | 'ashby'>('greenhouse');
  const [newBoardToken, setNewBoardToken] = useState('');
  const [newBoardCompany, setNewBoardCompany] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  // UI state
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // tracks boardId or action name

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Add new Board
  const handleAddBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardToken.trim()) return;

    setLoading('add-board');
    try {
      // In TanStack Start we can define simple APIs. Let's make a server function call or raw D1 insertion.
      // For simplicity, let's call a client-safe server mutation or create an inline backend handler.
      // But wait! We can implement a server function to save boards or do a POST to an api.
      // Let's call the manual discover/save api or save it using a fetch helper.
      // We can insert directly if we use TanStack Router Server Functions, or write a dedicated endpoint.
      // Let's implement a backend route `/api/crawl/save-board` or use direct client side POST to a route.
      // Wait, we can implement it as a server action! But a fetch to a quick API is extremely straightforward.
      // Let's write an api route `/api/crawl/save-board` in a separate file, or insert via server loader if it supports POST.
      // To keep things clean, let's create a quick API file `/api/crawl/save-board` or use fetch to `/api/crawl/discover?token=...`
      // Wait! Let's implement the DB save directly via a fetch to `/api/crawl/save-board` which we will create next.
      const res = await fetch('/api/crawl/save-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ats: newBoardAts, token: newBoardToken.trim(), companyName: newBoardCompany.trim() })
      });
      const data = await res.json() as any;
      if (data.success) {
        showStatus(`Board ${newBoardToken} saved successfully!`, 'success');
        setNewBoardToken('');
        setNewBoardCompany('');
        // Reload boards
        window.location.reload();
      } else {
        showStatus(data.error || 'Failed to save board', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error saving board', 'error');
    } finally {
      setLoading(null);
    }
  };

  // Toggle Board Active
  const handleToggleBoard = async (boardId: string, currentActive: boolean) => {
    setLoading(`toggle-${boardId}`);
    try {
      const res = await fetch('/api/crawl/toggle-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId, is_active: !currentActive })
      });
      const data = await res.json() as any;
      if (data.success) {
        setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_active: !currentActive ? 1 : 0 } : b));
        showStatus('Board status updated!', 'success');
      } else {
        showStatus(data.error || 'Failed to toggle board', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error updating board status', 'error');
    } finally {
      setLoading(null);
    }
  };

  // Run Crawl manually for a Board
  const handleRunCrawl = async (ats: string, token: string, boardId: string) => {
    setLoading(`crawl-${boardId}`);
    showStatus(`Triggering crawl for ${ats}/${token}...`, 'info');
    try {
      // Direct call to /api/crawl/$ats?token=token
      const res = await fetch(`/api/crawl/${ats}?token=${token}`);
      const data = await res.json() as any;
      if (data.success) {
        showStatus(`Crawl complete! Found ${data.count} jobs.`, 'success');
        // Reload page to pull updated stats & jobs
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showStatus(data.error || 'Crawl failed', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error running crawl', 'error');
    } finally {
      setLoading(null);
    }
  };

  // Trigger Cron crawling for all due boards
  const handleTriggerCron = async () => {
    setLoading('cron');
    showStatus('Running crawler cron scheduler...', 'info');
    try {
      const res = await fetch('/api/crawl/cron?force=true', { method: 'POST' });
      const data = await res.json() as any;
      if (data.success) {
        showStatus(`Cron execution successfully triggered: ${data.message}`, 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showStatus(data.error || 'Cron trigger failed', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error triggering cron', 'error');
    } finally {
      setLoading(null);
    }
  };

  // Search Jobs
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('search');
    try {
      const url = new URL('/api/jobs/crawler-search', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      if (searchLocation) url.searchParams.set('location', searchLocation);
      
      const res = await fetch(url.toString());
      const data = await res.json() as any;
      if (data.success) {
        setJobs(data.jobs);
        showStatus(`Found ${data.jobs.length} jobs matching criteria.`, 'success');
      } else {
        showStatus(data.error || 'Search failed', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error performing search', 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
                <Briefcase className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Webcrawler Job Agent
              </h1>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              API-first crawler aggregator for Greenhouse, Lever, and Ashby boards with cosine & LLM deduplication.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/jobs"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition hover:bg-slate-800"
            >
              Pipeline App
            </Link>
            <button
              onClick={handleTriggerCron}
              disabled={loading !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading === 'cron' ? 'animate-spin' : ''}`} />
              Run Scheduler Cron
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {statusMessage && (
          <div className={`rounded-xl border p-4 text-sm flex items-start gap-3 transition-all ${
            statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            statusMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
            'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}>
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="flex-1 font-semibold">{statusMessage.text}</p>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: 'Canonical Jobs', val: stats.canonical_count, icon: <Database className="h-5 w-5 text-indigo-400" />, desc: 'Deduplicated unique postings' },
            { title: 'Job Sources', val: stats.source_count, icon: <Layers className="h-5 w-5 text-emerald-400" />, desc: 'Crawled source mappings' },
            { title: 'Active Boards', val: stats.active_boards, icon: <Globe className="h-5 w-5 text-sky-400" />, desc: 'Crawling targets' },
            { title: 'LLM Runs (24h)', val: stats.llm_calls_24h, icon: <Activity className="h-5 w-5 text-amber-400" />, desc: 'Fuzzy match validations' },
            { title: 'Errors (24h)', val: stats.errors_24h, icon: <AlertTriangle className="h-5 w-5 text-rose-400" />, desc: 'Crawl/Ingest failures' },
          ].map(m => (
            <div key={m.title} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3 backdrop-blur-md shadow-md">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">{m.title}</span>
                {m.icon}
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white tabular-nums">{m.val || 0}</p>
                <p className="text-[10px] text-slate-500 leading-normal mt-1">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left Column (Main views) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-800 pb-px">
              {(['jobs', 'boards', 'logs'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 font-bold text-sm border-b-2 capitalize transition ${
                    activeTab === tab
                      ? 'border-amber-500 text-amber-500'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'logs' ? 'Audit Log' : tab}
                </button>
              ))}
            </div>

            {/* Tab Panel: Jobs */}
            {activeTab === 'jobs' && (
              <div className="space-y-6">
                
                {/* Search Form */}
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 bg-slate-900/40 p-4 border border-slate-800/60 rounded-2xl">
                  <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 h-11">
                    <Search className="h-4 w-4 text-slate-500 shrink-0" />
                    <input
                      type="text"
                      placeholder="Title or company keywords..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent border-0 outline-none text-sm text-slate-100 placeholder-slate-500 w-full"
                    />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 h-11">
                    <Globe className="h-4 w-4 text-slate-500 shrink-0" />
                    <input
                      type="text"
                      placeholder="Location filter..."
                      value={searchLocation}
                      onChange={e => setSearchLocation(e.target.value)}
                      className="bg-transparent border-0 outline-none text-sm text-slate-100 placeholder-slate-500 w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading === 'search'}
                    className="bg-amber-600 hover:bg-amber-500 transition px-5 h-11 text-sm font-bold text-white rounded-xl shadow-md disabled:opacity-50"
                  >
                    Search
                  </button>
                </form>

                {/* Jobs list */}
                <div className="space-y-4">
                  {jobs.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
                      No canonical jobs found matching search criteria.
                    </div>
                  ) : (
                    jobs.map((job: any) => (
                      <div key={job.id} className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-all shadow-sm space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="inline-block bg-indigo-500/10 text-indigo-400 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-indigo-500/20 mb-2">
                              {job.company_display}
                            </span>
                            <h3 className="text-base font-bold text-white leading-snug">{job.title_display}</h3>
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-semibold">
                              <Globe className="h-3 w-3 text-slate-500" />
                              {job.location_display || 'Remote'}
                              {job.remote === 1 && <span className="text-emerald-500 text-[10px] bg-emerald-500/10 px-1 rounded font-bold uppercase border border-emerald-500/20">Remote</span>}
                            </p>
                          </div>
                          
                          {/* Compensation */}
                          {(job.compensation_min || job.compensation_max) && (
                            <div className="text-right text-xs font-bold text-emerald-400 border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1 rounded-lg">
                              {job.compensation_currency || '$'}{job.compensation_min?.toLocaleString()} 
                              {job.compensation_max && ` - ${job.compensation_max?.toLocaleString()}`}
                            </div>
                          )}
                        </div>

                        {job.description_plain && (
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                            {job.description_plain}
                          </p>
                        )}

                        {/* Linked sources */}
                        {job.sources && job.sources.length > 0 && (
                          <div className="pt-3 border-t border-slate-800/80 space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Linked Sources ({job.sources.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {job.sources.map((s: any) => (
                                <a
                                  key={s.id}
                                  href={s.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[10.5px] font-bold text-slate-300 hover:text-amber-500 hover:border-amber-500/30 transition capitalize"
                                >
                                  <Globe className="h-2.5 w-2.5" />
                                  {s.ats} · {s.board_token}
                                  <ArrowRight className="h-2.5 w-2.5" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab Panel: Boards */}
            {activeTab === 'boards' && (
              <div className="space-y-6">
                
                {/* Boards List */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <th className="px-5 py-4">ATS</th>
                          <th className="px-5 py-4">Token</th>
                          <th className="px-5 py-4">Company Name</th>
                          <th className="px-5 py-4">Frequency</th>
                          <th className="px-5 py-4 text-center">Status</th>
                          <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {boards.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                              No boards configured. Add your first board in the right panel!
                            </td>
                          </tr>
                        ) : (
                          boards.map((board) => (
                            <tr key={board.id} className="hover:bg-slate-900/20 transition">
                              <td className="px-5 py-3 font-semibold text-slate-300 capitalize">{board.ats}</td>
                              <td className="px-5 py-3 font-mono text-slate-300">{board.token}</td>
                              <td className="px-5 py-3 text-white font-semibold">{board.company_name || '-'}</td>
                              <td className="px-5 py-3 text-slate-400 capitalize">{board.crawl_frequency_tier.replace('tier', 'Tier ')}</td>
                              <td className="px-5 py-3 text-center">
                                <button
                                  onClick={() => handleToggleBoard(board.id, board.is_active === 1)}
                                  disabled={loading === `toggle-${board.id}`}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                                    board.is_active === 1
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : 'bg-slate-800 border-slate-700 text-slate-500'
                                  }`}
                                >
                                  {board.is_active === 1 ? 'Active' : 'Disabled'}
                                </button>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => handleRunCrawl(board.ats, board.token, board.id)}
                                  disabled={loading === `crawl-${board.id}`}
                                  className="p-2 bg-slate-950 hover:bg-slate-800 text-amber-500 hover:text-amber-400 rounded-lg border border-slate-800 transition disabled:opacity-50"
                                  title="Force crawl now"
                                >
                                  <Play className="h-3 w-3 fill-current" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Panel: Logs */}
            {activeTab === 'logs' && (
              <div className="space-y-4">
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <th className="px-5 py-4">Time</th>
                          <th className="px-5 py-4">Event Type</th>
                          <th className="px-5 py-4">ATS/Token</th>
                          <th className="px-5 py-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-12 text-center text-slate-500">
                              No audit logs available.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log: any) => {
                            let detailsText = '';
                            try {
                              const parsed = JSON.parse(log.details);
                              detailsText = JSON.stringify(parsed);
                            } catch {
                              detailsText = log.details;
                            }

                            return (
                              <tr key={log.id} className="hover:bg-slate-900/20 transition">
                                <td className="px-5 py-3 text-slate-500 text-[10px]">
                                  {new Date(log.created_at).toLocaleTimeString()}
                                </td>
                                <td className="px-5 py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                    log.event_type === 'crawl_start' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                    log.event_type === 'crawl_complete' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                    log.event_type === 'dedup_merge' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                    log.event_type === 'vector_insert' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                                    'bg-red-500/10 border-red-500/20 text-red-400'
                                  }`}>
                                    {log.event_type}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-slate-300">
                                  {log.ats ? `${log.ats}/${log.board_token}` : '-'}
                                </td>
                                <td className="px-5 py-3 text-slate-400 max-w-xs truncate" title={detailsText}>
                                  {detailsText}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column (Sidebar inputs) */}
          <div className="space-y-6">
            
            {/* Add Target Board Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="h-4 w-4 text-amber-500" />
                  Add Target Board
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Insert a Greenhouse, Lever, or Ashby board token to begin tracking its postings.
                </p>
              </div>

              <form onSubmit={handleAddBoard} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ATS Provider</label>
                  <select
                    value={newBoardAts}
                    onChange={e => setNewBoardAts(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-amber-500/50"
                  >
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Board Slug / Token</label>
                  <input
                    type="text"
                    placeholder="e.g. google, ashby, lever"
                    value={newBoardToken}
                    onChange={e => setNewBoardToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-amber-500/50 placeholder-slate-600"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company Name (Display)</label>
                  <input
                    type="text"
                    placeholder="e.g. Google, Ashby Inc."
                    value={newBoardCompany}
                    onChange={e => setNewBoardCompany(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-amber-500/50 placeholder-slate-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading === 'add-board'}
                  className="w-full bg-amber-600 hover:bg-amber-500 transition py-2 text-xs font-bold text-white rounded-xl shadow-md disabled:opacity-50 disabled:pointer-events-none mt-2"
                >
                  {loading === 'add-board' ? 'Saving...' : 'Add Board'}
                </button>
              </form>
            </div>

            {/* Quick Audit / Help Card */}
            <div className="bg-slate-900/20 border border-slate-850 rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Deduplication pipeline</h3>
              <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed">
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">1</span>
                  <p><strong>Deterministic key:</strong> exact match on normalized title, company, location and sliding 7-day window.</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">2</span>
                  <p><strong>Fuzzy matching:</strong> Jaro-Winkler string similarity comparisons on same-company job titles (threshold: 0.87).</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-[10px] font-bold text-purple-400 border border-purple-500/20">3</span>
                  <p><strong>Vector embeddings:</strong> Querying Cloudflare Vectorize for semantic similarity using BGE model.</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-400 border border-amber-500/20">4</span>
                  <p><strong>Gemma-4 LLM validation:</strong> Gemma-4-26b logic resolving borderline cases inside a strict JSON schema.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

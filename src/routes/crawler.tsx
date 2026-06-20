import { useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Search,
  Globe,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Play,
  CheckCircle2,
  Plus,
  X
} from 'lucide-react';
import { PageHero, PageSection } from '@caliber/ui-kit';
import { getCrawlerStats } from '@/server/functions/crawler';

// Server loader runs queries directly on D1 via server function
export const Route = createFileRoute('/crawler')({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
    if (ctx.user.role !== "admin") throw redirect({ to: "/" });
  },
  loader: async () => {
    return getCrawlerStats();
  },
  component: CrawlerDashboard
});

function CrawlerDashboard() {
  const queryClient = useQueryClient();
  const loaderData = Route.useLoaderData() as any;

  // Local/UI states
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'jobs' | 'boards' | 'logs' | 'docs'>('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBoardAts, setNewBoardAts] = useState<'greenhouse' | 'lever' | 'ashby'>('greenhouse');
  const [newBoardToken, setNewBoardToken] = useState('');
  const [newBoardCompany, setNewBoardCompany] = useState('');

  // Overriding search results list
  const [searchedJobs, setSearchedJobs] = useState<any[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // tracks manual crawl or scheduler run status

  // useQuery with initialData from route loader
  const { data } = useQuery({
    queryKey: ['crawler-data'],
    queryFn: () => getCrawlerStats(),
    initialData: loaderData,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const { boards, jobs, auditLogs, stats } = data || {
    boards: [],
    jobs: [],
    auditLogs: [],
    stats: { canonical_count: 0, source_count: 0, active_boards: 0, errors_24h: 0, llm_calls_24h: 0 }
  };

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Toggle Board Active Status Mutation (with Optimistic Updates)
  const toggleBoardMutation = useMutation({
    mutationFn: async ({ boardId, nextActive }: { boardId: string; nextActive: boolean }) => {
      const res = await fetch('/api/crawl/toggle-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId, is_active: nextActive })
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to toggle board');
      return data;
    },
    onMutate: async ({ boardId, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ['crawler-data'] });
      const previousData = queryClient.getQueryData<any>(['crawler-data']);

      if (previousData) {
        queryClient.setQueryData(['crawler-data'], {
          ...previousData,
          boards: previousData.boards.map((b: any) =>
            b.id === boardId ? { ...b, is_active: nextActive ? 1 : 0 } : b
          ),
          stats: {
            ...previousData.stats,
            active_boards: previousData.stats.active_boards + (nextActive ? 1 : -1)
          }
        });
      }

      return { previousData };
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['crawler-data'], context.previousData);
      }
      showStatus(err.message || 'Error updating board status', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crawler-data'] });
    },
    onSuccess: () => {
      showStatus('Board status updated!', 'success');
    }
  });

  // Toggle Board Active Trigger
  const handleToggleBoard = async (boardId: string, currentActive: boolean) => {
    toggleBoardMutation.mutate({ boardId, nextActive: !currentActive });
  };

  // Add Board Mutation (with Optimistic Updates)
  const addBoardMutation = useMutation({
    mutationFn: async ({ ats, token, companyName }: { ats: string; token: string; companyName?: string }) => {
      const res = await fetch('/api/crawl/save-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ats, token, companyName })
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error || 'Failed to add board');
      return data;
    },
    onMutate: async ({ ats, token, companyName }) => {
      await queryClient.cancelQueries({ queryKey: ['crawler-data'] });
      const previousData = queryClient.getQueryData<any>(['crawler-data']);

      if (previousData) {
        // Optimistically add the new board to the board list
        const newBoardObj = {
          id: 'temp-id-' + Math.random(),
          ats: ats.toLowerCase(),
          token: token.trim(),
          company_name: companyName?.trim() || null,
          crawl_frequency_tier: 'tier2',
          is_active: 1,
          created_at: new Date().toISOString(),
          discovered_at: new Date().toISOString(),
        };

        queryClient.setQueryData(['crawler-data'], {
          ...previousData,
          boards: [newBoardObj, ...previousData.boards],
          stats: {
            ...previousData.stats,
            active_boards: previousData.stats.active_boards + 1
          }
        });
      }

      return { previousData };
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['crawler-data'], context.previousData);
      }
      showStatus(err.message || 'Error adding board', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crawler-data'] });
    },
    onSuccess: () => {
      showStatus('Board successfully added!', 'success');
      // Reset input fields
      setNewBoardToken('');
      setNewBoardCompany('');
      setIsAddModalOpen(false);
    }
  });

  // Handle Add Board Form Submission
  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardToken.trim()) {
      showStatus('Board token is required', 'error');
      return;
    }
    addBoardMutation.mutate({
      ats: newBoardAts,
      token: newBoardToken,
      companyName: newBoardCompany
    });
  };

  // Run Crawl manually for a Board
  const handleRunCrawl = async (ats: string, token: string, boardId: string) => {
    setLoading(`crawl-${boardId}`);
    showStatus(`Triggering crawl for ${ats}/${token}...`, 'info');
    try {
      const res = await fetch(`/api/crawl/${ats}?token=${token}`);
      const data = await res.json() as any;
      if (data.success) {
        showStatus(`Crawl complete! Found ${data.count} jobs.`, 'success');
        queryClient.invalidateQueries({ queryKey: ['crawler-data'] });
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
        queryClient.invalidateQueries({ queryKey: ['crawler-data'] });
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
    if (!searchQuery.trim() && !searchLocation.trim()) {
      setSearchedJobs(null); // Reset search to default live jobs list
      return;
    }
    setLoading('search');
    try {
      const url = new URL('/api/jobs/crawler-search', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      if (searchLocation) url.searchParams.set('location', searchLocation);
      
      const res = await fetch(url.toString());
      const data = await res.json() as any;
      if (data.success) {
        setSearchedJobs(data.jobs);
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

  const jobsToDisplay = searchedJobs !== null ? searchedJobs : jobs;

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Operations"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="Crawler Agent"
        description="API-first crawler aggregator for Greenhouse, Lever, and Ashby boards."
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
                showStatus('Refreshing crawler data...', 'info');
                await queryClient.invalidateQueries({ queryKey: ['crawler-data'] });
                showStatus('Crawler data refreshed!', 'success');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Board
            </button>
            <button
              onClick={handleTriggerCron}
              disabled={loading !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Play className={`h-4 w-4 ${loading === 'cron' ? 'animate-spin' : ''}`} />
              Run Scheduler Cron
            </button>
          </div>
        }
      />

      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all duration-300 ${
          statusMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />}
          {statusMessage.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />}
          {statusMessage.type === 'info' && <RefreshCw className="w-5 h-5 animate-spin shrink-0 text-blue-600" />}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { title: 'Canonical Jobs', val: stats.canonical_count, desc: 'Deduplicated postings' },
          { title: 'Job Sources', val: stats.source_count, desc: 'Source mappings' },
          { title: 'Active Boards', val: stats.active_boards, desc: 'Crawling targets' },
          { title: 'LLM Runs (24h)', val: stats.llm_calls_24h, desc: 'Fuzzy match checks' },
          { title: 'Errors (24h)', val: stats.errors_24h, desc: 'Crawl failures' },
        ].map(m => (
          <div key={m.title} className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{m.title}</div>
            <div className="text-2xl font-bold text-slate-900">{m.val || 0}</div>
            <p className="text-[10px] text-slate-400 mt-1 leading-normal">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        
        {/* Tabs */}
        <div className="flex w-full border-b border-slate-200 pb-px">
          {(['jobs', 'boards', 'logs', 'docs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-bold border-b-2 text-center transition cursor-pointer ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'jobs' ? 'Jobs' : tab === 'boards' ? 'Boards' : tab === 'logs' ? 'Audit Log' : 'Docs'}
            </button>
          ))}
        </div>

        {/* Tab Panel: Jobs */}
        {activeTab === 'jobs' && (
          <div className="space-y-6">
            
            {/* Search Form */}
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 bg-white/60 p-4 border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex-1 flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 h-11">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Title or company keywords..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-sm text-slate-800 placeholder-slate-400 w-full"
                />
              </div>
              <div className="flex-1 flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 h-11">
                <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Location filter..."
                  value={searchLocation}
                  onChange={e => setSearchLocation(e.target.value)}
                  className="bg-transparent border-0 outline-none text-sm text-slate-800 placeholder-slate-400 w-full"
                />
              </div>
              <button
                type="submit"
                disabled={loading === 'search'}
                className="bg-primary-600 hover:bg-primary-700 transition px-5 h-11 text-sm font-semibold text-white rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Search
              </button>
            </form>

            {/* Jobs list */}
            <div className="space-y-4">
              {jobsToDisplay.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm">
                  No canonical jobs found matching search criteria.
                </div>
              ) : (
                jobsToDisplay.map((job: any) => (
                  <div key={job.id} className="bg-white/60 border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-sm space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="inline-block bg-primary-50 text-primary-700 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-primary-200 mb-2">
                          {job.company_display}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{job.title_display}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-semibold">
                          <Globe className="h-3 w-3 text-slate-400" />
                          {job.location_display || 'Remote'}
                          {job.remote === 1 && <span className="text-emerald-700 text-[10px] bg-emerald-50 px-1 rounded font-bold uppercase border border-emerald-200">Remote</span>}
                        </p>
                      </div>
                      
                      {/* Compensation */}
                      {(job.compensation_min || job.compensation_max) && (
                        <div className="text-right text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          {job.compensation_currency || '$'}{job.compensation_min?.toLocaleString()} 
                          {job.compensation_max && ` - ${job.compensation_max?.toLocaleString()}`}
                        </div>
                      )}
                    </div>

                    {job.description_plain && (
                      <p className="text-xs text-slate-650 leading-relaxed line-clamp-2 font-medium">
                        {job.description_plain}
                      </p>
                    )}

                    {/* Linked sources */}
                    {job.sources && job.sources.length > 0 && (
                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked Sources ({job.sources.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {job.sources.map((s: any) => (
                            <a
                              key={s.id}
                              href={s.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10.5px] font-bold text-slate-600 hover:text-primary-600 hover:border-primary-300 transition capitalize"
                            >
                              <Globe className="h-2.5 w-2.5 text-slate-400" />
                              {s.ats} · {s.board_token}
                              <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
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
          <PageSection title="Crawled Boards" description="Greenhouse, Lever, and Ashby job boards currently tracked.">
            <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-4">ATS</th>
                      <th className="px-5 py-4">Token</th>
                      <th className="px-5 py-4">Company Name</th>
                      <th className="px-5 py-4">Frequency</th>
                      <th className="px-5 py-4 text-center">Status</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {boards.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                          No boards configured. Add your first board in the discovery panel!
                        </td>
                      </tr>
                    ) : (
                      boards.map((board: any) => (
                        <tr key={board.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-5 py-3 font-semibold text-slate-700 capitalize">{board.ats}</td>
                          <td className="px-5 py-3 font-mono text-slate-600">{board.token}</td>
                          <td className="px-5 py-3 text-slate-900 font-semibold">{board.company_name || '-'}</td>
                          <td className="px-5 py-3 text-slate-500 capitalize">{board.crawl_frequency_tier.replace('tier', 'Tier ')}</td>
                          <td className="px-5 py-3 text-center">
                            <button
                              onClick={() => handleToggleBoard(board.id, board.is_active === 1)}
                              disabled={toggleBoardMutation.isPending}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border cursor-pointer ${
                                board.is_active === 1
                                  ? 'bg-green-50 border-green-200 text-green-700'
                                  : 'bg-slate-100 border-slate-200 text-slate-400'
                              }`}
                            >
                              {board.is_active === 1 ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => handleRunCrawl(board.ats, board.token, board.id)}
                              disabled={loading === `crawl-${board.id}`}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 transition cursor-pointer inline-flex items-center"
                              title="Force crawl now"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </PageSection>
        )}

        {/* Tab Panel: Logs */}
        {activeTab === 'logs' && (
          <PageSection title="Audit Logs" description="Webcrawler ingestion and deduplication logs.">
            <div className="bg-white/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-4">Time</th>
                      <th className="px-5 py-4">Event</th>
                      <th className="px-5 py-4">ATS/Token</th>
                      <th className="px-5 py-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-slate-600">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-12 text-center text-slate-400">
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
                          <tr key={log.id} className="hover:bg-slate-50/50 transition">
                            <td className="px-5 py-3 text-slate-400 text-[10px]">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                log.event_type === 'crawl_start' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                log.event_type === 'crawl_complete' ? 'bg-green-50 border-green-200 text-green-700' :
                                log.event_type === 'dedup_merge' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                log.event_type === 'vector_insert' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                                'bg-red-50 border-red-200 text-red-700'
                              }`}>
                                {log.event_type}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-800">
                              {log.ats ? `${log.ats}/${log.board_token}` : '-'}
                            </td>
                            <td className="px-5 py-3 text-slate-500 max-w-xs truncate" title={detailsText}>
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
          </PageSection>
        )}

        {/* Tab Panel: Docs */}
        {activeTab === 'docs' && (
          <div className="space-y-8">
            <PageSection title="Deduplication Pipeline" description="How the Crawler Agent prevents duplicate postings across job boards.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 border border-indigo-200">1</span>
                    Deterministic Matcher
                  </h3>
                  <p className="text-xs text-slate-650 leading-relaxed font-medium">
                    Performs an exact match comparison on the normalized job title, company, location, and uses a sliding 7-day window. If the exact same posting exists, it is merged immediately.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-200">2</span>
                    Fuzzy Title Matcher
                  </h3>
                  <p className="text-xs text-slate-650 leading-relaxed font-medium">
                    Calculates Jaro-Winkler string similarity scores on job titles within the same company. Any title pair scoring above <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10.5px]">0.87</code> is flagged as a potential duplicate.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-50 text-xs font-bold text-purple-700 border border-purple-200">3</span>
                    Vector Embeddings (Semantic)
                  </h3>
                  <p className="text-xs text-slate-650 leading-relaxed font-medium">
                    Generates vector representations of the job descriptions and queries Cloudflare Vectorize for semantic similarity matching. This catches duplicate jobs written with different wording.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700 border border-amber-200">4</span>
                    LLM In-Context Validation
                  </h3>
                  <p className="text-xs text-slate-650 leading-relaxed font-medium">
                    Resolves borderline cases by sending job data to a specialized Workers AI instance (Llama/Gemma models). The LLM validates semantic equivalence to output a final deduplication decision.
                  </p>
                </div>
              </div>
            </PageSection>

            <PageSection title="How-To Use Guide" description="Step-by-step instructions for managing crawler configurations and jobs.">
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur-sm space-y-6">
                <div className="space-y-4 text-xs text-slate-650 leading-relaxed font-medium">
                  <div className="flex gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-600 shrink-0" />
                    <div>
                      <strong className="text-slate-900 text-[13px]">Managing Active Crawlers</strong>
                      <p className="mt-1">Go to the <strong className="text-slate-800">Boards</strong> tab. Toggle the status badge of any configured board to set it as <span className="text-green-700 font-semibold bg-green-50 px-1 rounded">Active</span> or <span className="text-slate-500 font-semibold bg-slate-150 px-1 rounded">Disabled</span>. Disabled boards are skipped during scheduled crawls.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-600 shrink-0" />
                    <div>
                      <strong className="text-slate-900 text-[13px]">Triggering Manual Crawls</strong>
                      <p className="mt-1">Under the <strong className="text-slate-800">Boards</strong> tab, locate a tracking board and click the <strong className="text-slate-800">Play button</strong> in the Actions column. This executes an on-demand real-time crawl of that specific slug, parsing current vacancies immediately.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-600 shrink-0" />
                    <div>
                      <strong className="text-slate-900 text-[13px]">Executing Scheduled Scheduler</strong>
                      <p className="mt-1">Click the <strong className="text-slate-800">Run Scheduler Cron</strong> button in the top right to force-run the crawler queue dispatcher. This enqueues all active boards that are due for their hourly or daily refresh cycle.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-600 shrink-0" />
                    <div>
                      <strong className="text-slate-900 text-[13px]">Monitoring Ingestion Actions</strong>
                      <p className="mt-1">Review the <strong className="text-slate-800">Audit Log</strong> tab to inspect real-time crawler logs, including API fetch triggers, duplicate merges, vector operations, and ingestion errors.</p>
                    </div>
                  </div>
                </div>
              </div>
            </PageSection>
          </div>
        )}
      </div>

      {/* Add Board Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => {
            setIsAddModalOpen(false);
            setNewBoardToken('');
            setNewBoardCompany('');
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-primary-600" />
                <h2 className="font-bold text-slate-900">Add Target Board</h2>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewBoardToken('');
                  setNewBoardCompany('');
                }}
                className="p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddBoard} className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-6 space-y-4">
                {/* ATS Selection */}
                <div className="space-y-1.5">
                  <label htmlFor="ats" className="text-xs font-bold uppercase tracking-wider text-slate-500 font-bold">
                    Applicant Tracking System (ATS)
                  </label>
                  <select
                    id="ats"
                    value={newBoardAts}
                    onChange={(e) => setNewBoardAts(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                  </select>
                </div>

                {/* Board Token */}
                <div className="space-y-1.5">
                  <label htmlFor="token" className="text-xs font-bold uppercase tracking-wider text-slate-500 font-bold">
                    Board Token / Slug
                  </label>
                  <input
                    id="token"
                    type="text"
                    required
                    placeholder={
                      newBoardAts === 'greenhouse' ? 'e.g., figma' :
                      newBoardAts === 'lever' ? 'e.g., vercel' :
                      'e.g., linear'
                    }
                    value={newBoardToken}
                    onChange={(e) => setNewBoardToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <p className="text-[10.5px] text-slate-400 font-semibold leading-normal">
                    This is the unique identifier in the job board URL.
                  </p>
                </div>

                {/* Company Name */}
                <div className="space-y-1.5">
                  <label htmlFor="company" className="text-xs font-bold uppercase tracking-wider text-slate-500 font-bold">
                    Company Name
                  </label>
                  <input
                    id="company"
                    type="text"
                    placeholder="e.g., Figma"
                    value={newBoardCompany}
                    onChange={(e) => setNewBoardCompany(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewBoardToken('');
                    setNewBoardCompany('');
                  }}
                  className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBoardMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {addBoardMutation.isPending ? 'Adding...' : 'Add Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



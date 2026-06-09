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

import {
  Play,
  Copy,
  Check,
  ExternalLink,
  FileCode,
} from "lucide-react";

interface ParsedApiCall {
  platform: string;
  statusCode: number;
  message: string;
  timestamp: string;
}

function parseApiIntegrationData(logs: any[]): {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  apiCalls: ParsedApiCall[];
} {
  let totalCalls = 0;
  let successCalls = 0;
  let errorCalls = 0;
  const apiCalls: ParsedApiCall[] = [];

  logs.forEach((log: any) => {
    const httpMatch = log.message.match(/(Greenhouse|Lever|Workable|RemoteOK|Himalayas|Jobicy|HTTP)\s+HTTP?\s*(\d{3})/i)
      || log.message.match(/HTTP\s+(\d{3})/i);
      
    if (httpMatch) {
      totalCalls++;
      const statusText = httpMatch[2] || httpMatch[1] || httpMatch[0].match(/\d{3}/)?.[0];
      const statusCode = parseInt(statusText || '200');
      
      const platform = (httpMatch[1] && httpMatch[1].toLowerCase() !== 'http') 
        ? httpMatch[1] 
        : 'API';
        
      if (statusCode >= 200 && statusCode < 300) {
        successCalls++;
      } else {
        errorCalls++;
      }
      
      apiCalls.push({
        platform,
        statusCode,
        message: log.message,
        timestamp: log.timestamp || log.createdAt || new Date().toISOString(),
      });
    }
  });

  return {
    totalCalls,
    successCalls,
    errorCalls,
    apiCalls,
  };
}

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent = "bg-white/70 dark:bg-slate-900/70 border-slate-200/60 dark:border-slate-805",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md ${accent}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100/60 dark:border-orange-900/40 shrink-0">
          {icon}
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">{value}</h3>
        </div>
      </div>
      {note && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 leading-snug">{note}</p>}
    </div>
  );
}

function OverviewTab({ run }: { run: any }) {
  const durationStr = (() => {
    if (!run.completedAt || run.status === 'running') return 'Running...';
    const durationMs = new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime();
    if (durationMs < 0) return '0s';
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  })();

  if (run.type === 'search') {
    const meta = run.metadata || {};
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Search Keywords</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{meta.keywords || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Location</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{meta.location || 'Any Location'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Execution Duration</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{durationStr}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Platform Sources</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{meta.platformSources || run.platform || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">New Jobs Scored</p>
          <p className="text-xs font-bold text-orange-600 dark:text-orange-400">{meta.newJobsScored ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Reused / Skipped Jobs</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{meta.reusedJobsCount ?? 0}</p>
        </div>
        {meta.searchUrl && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3 sm:col-span-2 lg:col-span-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">LinkedIn Search URL</p>
            <a href={meta.searchUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1 break-all">
              {meta.searchUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        )}
      </div>
    );
  } else {
    const stats = run.metadata.stats || {};
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Jobs Added</p>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+{stats.jobsAdded ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Jobs Updated</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{stats.jobsUpdated ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Execution Duration</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{durationStr}</p>
        </div>
        {run.agentName.includes('Discovery') ? (
          <>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Companies Checked</p>
              <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{stats.companiesChecked ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Companies Added</p>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+{stats.companiesAdded ?? 0}</p>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Jobs Deleted</p>
            <p className="text-xs font-semibold text-slate-950 dark:text-slate-100">{stats.jobsDeleted ?? 0}</p>
          </div>
        )}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Status</p>
          <p className="text-xs font-semibold text-slate-950 dark:text-slate-100 uppercase tracking-wider">{run.metadata.status}</p>
        </div>
        {stats.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-3 sm:col-span-2 lg:col-span-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-red-500 mb-1">Error Message</p>
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">{stats.error}</p>
          </div>
        )}
      </div>
    );
  }
}

function TimelineTab({ run }: { run: any }) {
  if (run.type === 'search') {
    const events = run.events || [];
    return (
      <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-4 py-2">
        {events.map((event: any, idx: number) => {
          const isError = event.level === 'error' || event.eventType === 'error';
          const isWarning = event.level === 'warning';
          const isSuccess = event.level === 'success' || event.eventType === 'job_found' || event.eventType === 'search_completed';
          
          let DotIcon = Info;
          let dotColor = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
          
          if (isError) {
            DotIcon = XCircle;
            dotColor = 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/40';
          } else if (isWarning) {
            DotIcon = AlertTriangle;
            dotColor = 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/40';
          } else if (isSuccess) {
            DotIcon = CheckCircle;
            dotColor = 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40';
          }

          if (event.eventType === 'search_started' || event.eventType === 'cron_triggered') {
            DotIcon = Play;
            dotColor = 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900';
          }

          return (
            <div key={event.id || idx} className="relative group">
              <div className={`absolute -left-[35px] top-0.5 rounded-full border p-1 shrink-0 ${dotColor} transition-transform duration-200 group-hover:scale-110`}>
                <DotIcon className="h-3.5 w-3.5" />
              </div>
              
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    {EVENT_TYPE_LABELS[event.eventType] || event.eventType.replace(/_/g, ' ')}
                  </span>
                  {event.platform && (
                    <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-100/40 dark:border-indigo-900/30">
                      {event.platform}
                    </span>
                  )}
                  {event.metadata?.matchScore && (
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-100/40 dark:border-indigo-900/30">
                      Match: {event.metadata.matchScore}%
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {event.message}
                </p>
                {event.metadata && (event.metadata.jobTitle || event.metadata.company) && (
                  <p className="text-[10px] text-slate-500">
                    {event.metadata.jobTitle} at <span className="font-semibold text-slate-600 dark:text-slate-400">{event.metadata.company}</span> ({event.metadata.location})
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    const logs = run.metadata.workerLogs || [];
    const milestones = logs.filter((log: any) => {
      const msg = log.message.toLowerCase();
      return msg.includes('discovered') || msg.includes('updated') || msg.includes('started') || msg.includes('completed') || msg.includes('failed') || msg.includes('cooldown') || msg.includes('http');
    });

    if (milestones.length === 0) {
      return (
        <p className="text-xs text-slate-500 italic p-2">No milestone events detected. Refer to the Developer Console tab for the full detailed log output.</p>
      );
    }

    return (
      <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-4 py-2">
        {milestones.map((log: any, idx: number) => {
          const isError = log.type === 'error' || log.message.toLowerCase().includes('fail') || log.message.toLowerCase().includes('error');
          const isWarning = log.type === 'warning' || log.message.toLowerCase().includes('cooldown');
          const isSuccess = log.type === 'success' || log.message.includes('✓') || log.message.toLowerCase().includes('completed');

          let DotIcon = Info;
          let dotColor = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

          if (isError) {
            DotIcon = XCircle;
            dotColor = 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/40';
          } else if (isWarning) {
            DotIcon = AlertTriangle;
            dotColor = 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/40';
          } else if (isSuccess) {
            DotIcon = CheckCircle;
            dotColor = 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40';
          }

          return (
            <div key={idx} className="relative group">
              <div className={`absolute -left-[35px] top-0.5 rounded-full border p-1 shrink-0 ${dotColor} transition-transform duration-200 group-hover:scale-110`}>
                <DotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400">
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                </span>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {log.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}

function ApiHealthTab({ run }: { run: any }) {
  const logs = run.type === 'search' 
    ? run.events.map((e: any) => ({ message: e.message, timestamp: e.createdAt, type: e.level }))
    : (run.metadata.workerLogs || []);

  const { totalCalls, successCalls, apiCalls } = parseApiIntegrationData(logs);

  if (totalCalls === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <FileCode className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-xs font-semibold text-slate-500">No integration API calls logged for this run.</p>
        <p className="text-[10px] text-slate-400 mt-1 max-w-xs">All results were successfully processed locally or served from the cache.</p>
      </div>
    );
  }

  const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Integration API Success Rate</h4>
            <p className="text-[10px] text-slate-500">Proportion of success response status codes (2xx) versus errors.</p>
          </div>
          <div className="text-right">
            <span className={`text-sm font-extrabold ${successRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : successRate >= 70 ? 'text-orange-500' : 'text-red-500'}`}>
              {successRate}%
            </span>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{successCalls}/{totalCalls} Successful Calls</p>
          </div>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${successRate >= 90 ? 'bg-emerald-500' : successRate >= 70 ? 'bg-orange-500' : 'bg-red-500'}`}
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <th className="p-2.5">Platform</th>
              <th className="p-2.5">Status Code</th>
              <th className="p-2.5">Response message</th>
              <th className="p-2.5 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white/30 dark:bg-slate-900/30">
            {apiCalls.map((call, idx) => {
              const statusColor = call.statusCode >= 200 && call.statusCode < 300 
                ? 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-900/40' 
                : call.statusCode === 429
                ? 'text-orange-700 bg-orange-50 border-orange-100 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-900/40 animate-pulse'
                : 'text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/40';

              return (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{call.platform}</td>
                  <td className="p-2.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${statusColor}`}>
                      HTTP {call.statusCode}
                    </span>
                  </td>
                  <td className="p-2.5 font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all whitespace-pre-wrap">{call.message}</td>
                  <td className="p-2.5 text-right text-slate-400 text-[10px] whitespace-nowrap">
                    {new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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

function ConsoleLogsTab({ run }: { run: any }) {
  const [filterText, setFilterText] = useState('');
  
  const rawLogs = run.type === 'search'
    ? run.events.map((e: any) => ({
        timestamp: e.createdAt,
        type: e.level,
        message: e.message,
        metadata: e.metadata,
      }))
    : (run.metadata.workerLogs || []);

  const filteredLogs = rawLogs.filter((log: any) => 
    log.message.toLowerCase().includes(filterText.toLowerCase())
  );

  const copyText = rawLogs.map((log: any) => 
    `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type.toUpperCase()}] ${log.message}`
  ).join('\n');

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <input 
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter console output..."
          className="h-8 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 w-full max-w-xs"
        />
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className="text-[10px] text-slate-400 font-mono">
            Showing {filteredLogs.length}/{rawLogs.length} lines
          </span>
          <CopyButton text={copyText} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 shadow-inner overflow-hidden">
        <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 border-b border-slate-880">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500/80" />
            <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
            <span className="w-2 h-2 rounded-full bg-green-500/80" />
          </div>
          <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 font-mono">Developer Console</span>
        </div>

        <div className="p-3 text-[10px] leading-normal font-mono select-text max-h-60 overflow-y-auto space-y-1 text-slate-300 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {filteredLogs.map((log: any, idx: number) => {
            const levelColor = 
              log.type === 'error' ? 'text-red-400 font-semibold' :
              log.type === 'warning' ? 'text-amber-400 font-semibold' :
              log.type === 'success' ? 'text-emerald-400 font-semibold' :
              'text-slate-300';

            return (
              <div key={idx} className="hover:bg-slate-900/40 rounded px-1 transition-colors py-0.5">
                <span className="text-slate-600 shrink-0 select-none mr-2">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span className={`uppercase text-[8.5px] font-bold border px-1 rounded mr-2 ${
                  log.type === 'error' ? 'text-red-400 border-red-950 bg-red-950/10' :
                  log.type === 'warning' ? 'text-amber-400 border-amber-950 bg-amber-950/10' :
                  log.type === 'success' ? 'text-emerald-400 border-emerald-950 bg-emerald-950/10' :
                  'text-slate-400 border-slate-900 bg-slate-900/10'
                }`}>
                  {log.type}
                </span>
                <span className={`${levelColor} break-all whitespace-pre-wrap`}>
                  {log.message}
                </span>

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div className="pl-6 mt-1">
                    <details className="group">
                      <summary className="text-[8px] cursor-pointer text-orange-500/80 hover:text-orange-400 font-sans select-none focus:outline-none">
                        View Payload JSON
                      </summary>
                      <pre className="mt-1 p-2 bg-slate-900/80 rounded border border-slate-850 text-[9px] text-emerald-400 overflow-x-auto whitespace-pre">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
          {filteredLogs.length === 0 && (
            <div className="py-4 text-center text-slate-500 italic">
              No matching terminal logs found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [localAgentName, setLocalAgentName] = useState(search.agentName);
  const deferredAgentName = useDeferredValue(localAgentName);

  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());
  const [activeTabs, setActiveTabs] = useState<Record<string, 'overview' | 'timeline' | 'api' | 'console'>>({});

  useEffect(() => {
    if (deferredAgentName !== search.agentName) {
      navigate({ search: (prev) => ({ ...prev, agentName: deferredAgentName, page: 1 }) });
    }
  }, [deferredAgentName, navigate, search.agentName]);

  const { data } = useQuery({
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

  function handleFilterChange(key: keyof LogsSearchParams, value: string) {
    navigate({ search: (prev) => ({ ...prev, [key]: value, page: 1 }) });
  }

  function handlePageChange(newPage: number) {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  }

  const toggleExpand = (runId: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const setActiveTab = (runId: string, tab: 'overview' | 'timeline' | 'api' | 'console') => {
    setActiveTabs((prev) => ({ ...prev, [runId]: tab }));
  };

  function handleExportCsv() {
    const headers = ["ID", "Type", "Level", "Agent Name", "Platform", "Message", "Created At"];
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.type,
          row.level,
          `"${(row.agentName || "").replace(/"/g, '""')}"`,
          `"${(row.platform || "").replace(/"/g, '""')}"`,
          `"${row.message.replace(/"/g, '""')}"`,
          row.createdAt,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `caliber_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="spx-page space-y-6">
      <PageHero
        eyebrow="Activity Audit"
        icon={<Terminal className="h-3.5 w-3.5" />}
        title="Activity Logs & Audits"
        description="Monitor automated sync schedules, manual scanning executions, AI model results, and API integration endpoints."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50 cursor-pointer shadow-sm"
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
          icon={<Search className="h-5 w-5 text-orange-500" />}
          label="Total Searches"
          value={summary.totalSearches.toLocaleString()}
          note="Active saved agents and manual runs"
          accent="bg-white/70 dark:bg-slate-900/70 border-slate-200/60 dark:border-slate-800"
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
          label="Jobs Found"
          value={summary.totalJobsFound.toLocaleString()}
          note="Surfaced matching opportunities"
          accent="bg-white/70 dark:bg-slate-900/70 border-slate-200/60 dark:border-slate-800"
        />
        <MetricCard
          icon={<Layers className="h-5 w-5 text-slate-500" />}
          label="Jobs Skipped"
          value={summary.totalJobsSkipped.toLocaleString()}
          note="Duplicates and score filter rejects"
          accent="bg-white/70 dark:bg-slate-900/70 border-slate-200/60 dark:border-slate-800"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          label="Errors Logged"
          value={summary.totalErrors.toLocaleString()}
          note="Background runner or API integration issues"
          accent="bg-white/70 dark:bg-slate-900/70 border-slate-200/60 dark:border-slate-800"
        />
      </div>

      <PageSection
        title="Events & Sessions"
        description="Filter integrations, execution levels, or platforms to inspect detailed log parameters."
      >
        {/* Filters */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4 bg-white/40 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 backdrop-blur-sm shadow-sm">
          <div>
            <label className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Event Type
            </label>
            <select
              value={search.eventType}
              onChange={(e) => handleFilterChange("eventType", e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
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
            <label className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Channel / Platform
            </label>
            <select
              value={search.platform}
              onChange={(e) => handleFilterChange("platform", e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
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
            <label className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Log Level
            </label>
            <select
              value={search.level}
              onChange={(e) => handleFilterChange("level", e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">All Levels</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Agent Search
            </label>
            <div className="relative">
              <input
                type="text"
                value={localAgentName}
                onChange={(e) => setLocalAgentName(e.target.value)}
                placeholder="Agent name..."
                className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-3 text-xs font-semibold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
              />
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Grouped Logs Cards Stream */}
        <div className="space-y-4">
          {rows.map((row) => {
            const isExpanded = expandedRunIds.has(row.id);
            const activeTab = activeTabs[row.id] || 'overview';
            
            const levelStyles: Record<string, { bg: string; text: string; border: string; icon: any }> = {
              info: {
                bg: 'bg-blue-50/50 dark:bg-blue-950/20',
                text: 'text-blue-700 dark:text-blue-400',
                border: 'border-blue-100 dark:border-blue-900/40',
                icon: Info,
              },
              success: {
                bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
                text: 'text-emerald-700 dark:text-emerald-400',
                border: 'border-emerald-100 dark:border-emerald-900/40',
                icon: CheckCircle,
              },
              warning: {
                bg: 'bg-orange-50/50 dark:bg-orange-950/20',
                text: 'text-orange-700 dark:text-orange-400',
                border: 'border-orange-100 dark:border-orange-900/40',
                icon: AlertTriangle,
              },
              error: {
                bg: 'bg-red-50/50 dark:bg-red-950/20',
                text: 'text-red-700 dark:text-red-400',
                border: 'border-red-100 dark:border-red-900/40',
                icon: XCircle,
              },
            };

            const statusStyles = {
              completed: { text: 'Completed', color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 font-semibold border-emerald-200/50 dark:border-emerald-900/30' },
              failed: { text: 'Failed', color: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 font-semibold border-red-200/50 dark:border-red-900/30' },
              running: { text: 'Running', color: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 font-semibold border-orange-200/50 dark:border-orange-900/30 animate-pulse' },
            };

            const style = levelStyles[row.level] || levelStyles.info;
            const statusInfo = statusStyles[row.status] || statusStyles.completed;
            const Icon = style.icon;

            const platforms = row.platform 
              ? row.platform.split(',').map(p => p.trim())
              : [];

            return (
              <div 
                key={row.id} 
                className={`spx-glass-card overflow-hidden border-l-4 transition-all duration-350 ${
                  row.level === 'error' ? 'border-l-red-500 shadow-red-500/5' :
                  row.level === 'warning' ? 'border-l-orange-500 shadow-orange-500/5' :
                  row.level === 'success' ? 'border-l-emerald-500 shadow-emerald-500/5' :
                  'border-l-slate-400'
                } bg-white/70 dark:bg-slate-900/75 border-slate-200/60 dark:border-slate-800/80 shadow-sm hover:shadow-md`}
              >
                {/* Collapsible header */}
                <div 
                  onClick={() => toggleExpand(row.id)}
                  className="p-4 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-colors duration-150"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`rounded-lg p-2 shrink-0 ${style.bg} ${style.text} border ${style.border}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusInfo.color}`}>
                          {statusInfo.text}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {row.type === 'search' ? 'Search agent' : 'integration sync'}
                        </span>
                        {platforms.map(p => (
                          <span key={p} className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-100/40 dark:border-indigo-900/30">
                            {PLATFORM_LABELS[p.toLowerCase()] || p}
                          </span>
                        ))}
                        {row.agentName && (
                          <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded border border-orange-100/40 dark:border-orange-900/30">
                            {row.agentName}
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-100 leading-snug">
                        {row.message}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 pl-11 md:pl-0 shrink-0">
                    <div className="flex flex-col items-start md:items-end text-[10px] text-slate-500 leading-normal">
                      <div className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatDistanceToNow(parseISO(row.createdAt), { addSuffix: true })}</span>
                      </div>
                      <span>
                        {new Date(row.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <button className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                      <ChevronDown className={`h-4.5 w-4.5 transition-transform duration-250 ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Expansion details */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/10 p-4 space-y-4">
                    {/* Inner Tabs */}
                    <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 gap-1 sm:gap-2">
                      {[
                        { id: 'overview', label: 'Overview', icon: Info },
                        { id: 'timeline', label: 'Timeline', icon: Clock },
                        { id: 'api', label: 'API Calls', icon: FileCode },
                        { id: 'console', label: 'Console Logs', icon: Terminal },
                      ].map(tab => {
                        const TabIcon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab(row.id, tab.id as any);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all -mb-px ${
                              isActive 
                                ? 'border-orange-500 text-orange-600 dark:text-orange-400' 
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 dark:hover:text-slate-300'
                            }`}
                          >
                            <TabIcon className="h-3.5 w-3.5" />
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1">
                      {activeTab === 'overview' && <OverviewTab run={row} />}
                      {activeTab === 'timeline' && <TimelineTab run={row} />}
                      {activeTab === 'api' && <ApiHealthTab run={row} />}
                      {activeTab === 'console' && <ConsoleLogsTab run={row} />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="py-16 text-center bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 rounded-xl">
              <FileText className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">
                No activity logs found matching the current filters.
              </p>
            </div>
          )}
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
      <div className="h-28 w-full rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
        ))}
      </div>
      <div className="h-96 w-full rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
    </div>
  );
}


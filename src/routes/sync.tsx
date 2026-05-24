/**
 * V3 Sync Dashboard
 * Refactored with TanStack Query for smart caching
 * Shows worker status, sync logs with errors, and job stats
 */

import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PageHero, PageSection } from '@caliber/ui-kit'
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

// ============================================
// Types
// ============================================

interface WorkerStatus {
  name: string
  icon: string
  sources: string[]
  schedule: string
  lastSync: string | null
  status: 'running' | 'completed' | 'failed' | 'never'
  error?: string
}

interface SourceStatus {
  lastSync: string | null
  status: 'running' | 'completed' | 'failed' | 'never'
  jobsAdded: number
  error?: string
}

interface DashboardStats {
  totalJobs: number
  totalDiscoveredCompanies: number
  pendingCompanies: number
  jobsBySource: {
    greenhouse: number
    lever: number
    workable: number
  }
  lastSyncAt: string | null
  sourceSyncStatus: Record<string, SourceStatus>
  workerStatus: Record<string, WorkerStatus>
}

interface SyncLog {
  id: string
  syncType: string
  source: string | null
  startedAt: string | null
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  stats: {
    jobsAdded: number
    jobsUpdated: number
    jobsDeleted: number
    company?: string
    error?: string
  }
  logs: Array<{ timestamp: string; type: string; message: string }>
}

// ============================================
// Query Client (singleton for this route)
// ============================================


// ============================================
// API Functions
// ============================================

async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch('/api/v3/stats')
  const data = (await res.json()) as { success: boolean; error?: string; stats: DashboardStats }
  if (!data?.success) throw new Error(data?.error || 'Failed to fetch stats')
  return data.stats
}

async function fetchLogs(
  limit = 20
): Promise<{ logs: SyncLog[]; meta: { recentErrors: number } }> {
  const res = await fetch(`/api/v3/logs?limit=${limit}`)
  const data = (await res.json()) as {
    success: boolean
    error?: string
    logs: SyncLog[]
    meta: { recentErrors: number }
  }
  if (!data?.success) throw new Error(data?.error || 'Failed to fetch logs')
  return { logs: data.logs, meta: data.meta }
}



// ============================================
// Dashboard Component
// ============================================

function SyncDashboardContent() {
  const queryClient = useQueryClient()
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Stats query
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['sync-stats'],
    queryFn: fetchStats,
    refetchInterval: autoRefresh ? 10000 : false  // 10s refresh
  })

  // Logs query
  const { data: logsData } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: () => fetchLogs(30),
    refetchInterval: autoRefresh ? 10000 : false
  })

  // Helpers
  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never'
    const date = new Date(iso)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never'
    const date = new Date(iso)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + formatTime(iso)
  }



  if (statsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Error loading dashboard</p>
          <p className="text-sm">{String(statsError)}</p>
        </div>
      </div>
    )
  }

  const logs = logsData?.logs || []
  const recentErrors = logsData?.meta?.recentErrors || 0

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Operations"
        icon={<RefreshCw className="h-3.5 w-3.5" />}
        title="Source Operations"
        description="Internal sync health, source coverage, and recent worker activity for the jobs ingestion pipeline."
        actions={
          <>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['sync-stats'] })
                queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </>
        }
      />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Jobs" value={stats?.totalJobs || 0} />
          <StatCard label="Discovered Companies" value={stats?.totalDiscoveredCompanies || 0} />
          <StatCard label="Pending Discovery" value={stats?.pendingCompanies || 0} />
          <StatCard
            label="Last Sync"
            value={stats?.lastSyncAt ? formatDate(stats.lastSyncAt) : 'Never'}
            isText
          />
        </div>

        {/* Jobs by Source */}
        <PageSection
          title="Jobs by Source"
          description="Current inventory across ingestion sources."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SourceCard
              source="greenhouse"
              count={stats?.jobsBySource?.greenhouse || 0}
              accentColor="border-l-green-500"
            />
            <SourceCard
              source="lever"
              count={stats?.jobsBySource?.lever || 0}
              accentColor="border-l-blue-500"
            />
            <SourceCard
              source="workable"
              count={stats?.jobsBySource?.workable || 0}
              accentColor="border-l-purple-500"
            />
          </div>
        </PageSection>

        {/* Worker Status */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sync Workers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Ordered: Discovery, ATS */}
            {['discovery', 'ats'].map((id) => {
              const worker = stats?.workerStatus?.[id]
              if (!worker) return null
              return (
                <WorkerCard
                  key={id}
                  workerId={id as 'ats' | 'discovery'}
                  worker={worker}
                  formatDate={formatDate}
                />
              )
            })}
          </div>
        </div>

        {/* Recent Sync Logs */}
        <PageSection
          title="Recent Sync Runs"
          description="Recent job ingestion and discovery activity."
          className="p-0 overflow-hidden"
          contentClassName=""
          actions={<span className="text-xs text-slate-500">{logs.length} logs</span>}
        >
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {logs.map((log) => (
              <LogEntry
                key={log.id}
                log={log}
                isExpanded={expandedLog === log.id}
                onToggle={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                formatTime={formatTime}
              />
            ))}
            {logs.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                No sync logs yet
              </div>
            )}
          </div>
        </PageSection>
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

function StatCard({ label, value, isText = false }: { label: string; value: string | number; isText?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/82 p-5 shadow-sm backdrop-blur-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className={`font-bold ${isText ? 'text-sm text-slate-700' : 'text-2xl text-slate-900'}`}>
        {value}
      </div>
    </div>
  )
}

function SourceCard({
  source,
  count,
  accentColor
}: {
  source: string
  count: number
  accentColor: string
}) {
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${accentColor} bg-slate-50 p-4`}>
      <div className="text-xs text-slate-500 mb-1 capitalize">{source}</div>
      <div className="text-2xl font-bold text-slate-900">
        {count.toLocaleString()}
      </div>
    </div>
  )
}

function WorkerCard({
  workerId,
  worker,
  formatDate
}: {
  workerId: 'ats' | 'discovery'
  worker: WorkerStatus
  formatDate: (iso: string | null) => string
}) {
  const bgColors: Record<string, string> = {
    ats: 'bg-green-50 border-green-200',
    jobicy: 'bg-amber-50 border-amber-200',
    remoteok: 'bg-emerald-50 border-emerald-200',
    himalayas: 'bg-blue-50 border-blue-200',
    discovery: 'bg-purple-50 border-purple-200'
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${bgColors[workerId] || 'bg-slate-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{worker.icon}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{worker.schedule}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${worker.status === 'running' ? 'bg-blue-100 text-blue-700' :
            worker.status === 'failed' ? 'bg-red-100 text-red-700' :
              worker.status === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-600'
            }`}>
            {worker.status}
          </span>
        </div>
      </div>
      <h3 className="font-semibold text-slate-900">{worker.name}</h3>
      <p className="text-xs text-slate-500 mt-1">{worker.sources.join(' • ')}</p>
      <p className="text-xs text-slate-500 mt-1">
        Last: {worker.lastSync ? formatDate(worker.lastSync) : 'Never'}
      </p>
      {worker.error && (
        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          {worker.error}
        </p>
      )}
    </div>
  )
}

function LogEntry({
  log,
  isExpanded,
  onToggle,
  formatTime
}: {
  log: SyncLog
  isExpanded: boolean
  onToggle: () => void
  formatTime: (iso: string | null) => string
}) {


  const getSourceLabel = (log: SyncLog) => {
    if (log.syncType === 'discovery') return '🔍 Discovery'
    if (!log.source) return log.syncType
    const icons: Record<string, string> = {
      greenhouse: '🏢',
      lever: '🔧',
      workable: '💼',
      remoteok: '🌐',
      himalayas: '🏔️',
      jobicy: '💡'
    }
    const icon = icons[log.source.toLowerCase()] || ''
    return `${icon} ${log.source}${log.stats.company ? ` / ${log.stats.company}` : ''}`
  }

  return (
    <div className={`${log.status === 'failed' ? 'bg-red-50' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {log.status === 'running' ? (
              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
            ) : log.status === 'failed' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            <div>
              <div className="font-medium text-sm text-slate-900">
                {formatTime(log.startedAt)} - {getSourceLabel(log)}
              </div>
              <div className="text-xs text-slate-500">
                {log.status === 'failed' && log.stats.error ? (
                  <span className="text-red-600">{log.stats.error}</span>
                ) : log.syncType === 'discovery' ? (
                  `Checked ${(log.stats as any).companiesChecked || 0}: ${(log.stats as any).companiesAdded || 0} new, ${(log.stats as any).companiesUpdated || 0} updated`
                ) : (
                  `+${log.stats.jobsAdded} added, ${log.stats.jobsUpdated} updated`
                )}
              </div>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && log.logs.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-slate-900 rounded-lg p-3 text-xs font-mono max-h-48 overflow-y-auto">
            {[...log.logs].reverse().map((entry, i) => (
              <div key={i} className={`${entry.type === 'error' ? 'text-red-400' :
                entry.type === 'warning' ? 'text-yellow-400' :
                  entry.type === 'success' ? 'text-green-400' :
                    'text-slate-300'
                }`}>
                [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Route Export with QueryClientProvider
// ============================================

export const Route = createFileRoute('/sync')({
  component: SyncDashboardContent,
})

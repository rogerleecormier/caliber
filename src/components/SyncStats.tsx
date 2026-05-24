import { useEffect, useState } from 'react'

export interface SyncStats {
  jobsAdded: number
  jobsUpdated: number
  jobsDeleted: number
  companiesAdded: number
  companiesDeleted: number
}

export interface SyncStatsProps {
  stats: SyncStats
  progress?: number
  duration?: number
  isRunning?: boolean
}

function StatCard({
  label,
  value,
  color = 'text-slate-700',
  animate = false
}: {
  label: string
  value: number
  color?: string
  animate?: boolean
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value)
      return
    }

    const duration = 500
    const steps = 20
    const increment = value / steps
    let current = 0

    const interval = setInterval(() => {
      current++
      setDisplayValue(Math.min(Math.round(increment * current), value))
      if (current >= steps) {
        clearInterval(interval)
      }
    }, duration / steps)

    return () => clearInterval(interval)
  }, [value, animate])

  return (
    <div className="bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-3xl font-bold ${color}`}>
        {displayValue.toLocaleString()}
      </div>
    </div>
  )
}

export function SyncStats({ stats, progress = 0, duration, isRunning = false }: SyncStatsProps) {
  const [elapsedTime, setElapsedTime] = useState(duration || 0)

  useEffect(() => {
    if (!isRunning) {
      if (duration) {
        setElapsedTime(duration)
      }
      return
    }

    const startTime = Date.now() - (duration || 0)
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 100)

    return () => clearInterval(interval)
  }, [isRunning, duration])

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`
  }

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {isRunning && (
        <div className="bg-slate-100 rounded-lg p-4 border border-slate-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700">Progress</span>
            <span className="text-sm font-semibold text-slate-900">{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="bg-slate-100 rounded-lg p-4 text-center border border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
          {isRunning ? 'Elapsed Time' : 'Total Duration'}
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {formatDuration(elapsedTime)}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Jobs Added"
          value={stats.jobsAdded}
          color="text-green-600"
          animate={isRunning}
        />
        <StatCard
          label="Jobs Updated"
          value={stats.jobsUpdated}
          color="text-blue-600"
          animate={isRunning}
        />
        <StatCard
          label="Jobs Deleted"
          value={stats.jobsDeleted}
          color="text-red-600"
          animate={isRunning}
        />
        <StatCard
          label="Companies"
          value={stats.companiesAdded + stats.companiesDeleted}
          color="text-purple-600"
          animate={isRunning}
        />
      </div>
    </div>
  )
}

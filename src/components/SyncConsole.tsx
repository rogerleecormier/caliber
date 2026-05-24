import { useEffect, useRef } from 'react'

export interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

export interface SyncConsoleProps {
  logs: LogEntry[]
  isRunning?: boolean
  onClear?: () => void
}

export function SyncConsole({ logs, isRunning = false, onClear }: SyncConsoleProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    
    // Mirror latest log to browser console if it exists
    const lastLog = logs[logs.length - 1]
    if (lastLog) {
      const style = lastLog.type === 'error' ? 'color: red' : 
                   lastLog.type === 'success' ? 'color: green' : 
                   lastLog.type === 'warning' ? 'color: orange' : 'color: gray'
      console.log(`%c[Sync] ${lastLog.message}`, style)
    }
  }, [logs])

  const copyLogs = () => {
    const text = logs.map(log => `[${log.timestamp}] ${log.message}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const exportLogs = () => {
    const text = logs.map(log => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sync-logs-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-300 font-mono">CONSOLE</div>
          {isRunning && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Running</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyLogs}
            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            disabled={logs.length === 0}
          >
            Copy
          </button>
          <button
            onClick={exportLogs}
            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            disabled={logs.length === 0}
          >
            Export
          </button>
          {onClear && (
            <button
              onClick={onClear}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              disabled={logs.length === 0}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-auto bg-slate-900 p-4 font-mono text-sm">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">
            No logs yet. Start a sync operation to see output here.
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`mb-1 ${
                log.type === 'error'
                  ? 'text-red-400'
                  : log.type === 'success'
                    ? 'text-green-400'
                    : log.type === 'warning'
                      ? 'text-yellow-400'
                      : 'text-slate-300'
              }`}
            >
              <span className="text-slate-500">[{log.timestamp}]</span> {log.message}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

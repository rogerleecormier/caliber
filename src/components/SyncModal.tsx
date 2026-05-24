import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Check, AlertCircle, Play, ArrowDown } from 'lucide-react'
import type { SyncReport } from '../lib/sync-report'
import { useQueryClient } from '@tanstack/react-query'

interface SyncModalProps {
  isOpen: boolean
  onClose: () => void
  activeSyncId: string | null
  onSyncStart: (syncId: string) => void
  onSyncComplete: () => void
}

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

export default function SyncModal({ isOpen, onClose, activeSyncId, onSyncStart, onSyncComplete }: SyncModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)
  
  // Granular sync options
  const [enableDiscovery, setEnableDiscovery] = useState(false)
  const [enableCleanup, setEnableCleanup] = useState(false)
  const [enableJobUpdate, setEnableJobUpdate] = useState(true)
  const [enableNewJobs, setEnableNewJobs] = useState(true)
  
  // Source selection
  const [selectedSources, setSelectedSources] = useState<string[]>([
    'Greenhouse', 'Lever', 'Workable'
  ])
  
  const toggleSource = (source: string) => {
    setSelectedSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }
  
  const [hasStarted, setHasStarted] = useState(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const terminalBodyRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  
  const queryClient = useQueryClient()

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll) {
      // Use instant scroll for logs to prevent jitter
      logsEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [logs, shouldAutoScroll])

  const scrollToBottom = () => {
    setShouldAutoScroll(true)
    // The useEffect will handle the actual scrolling with 'instant' behavior
    // This prevents the race condition where smooth scrolling triggers onScroll
    // which might incorrectly detect that we aren't at the bottom yet
  }

  // Handle scroll events to toggle auto-scroll
  const handleScroll = () => {
    const element = terminalBodyRef.current
    if (!element) return

    // Check if user is near bottom (within 50px)
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50
    
    // Only update if the user manually scrolled away from bottom
    // If we are already auto-scrolling, don't disable it just because of a pixel difference during render
    if (isNearBottom) {
      setShouldAutoScroll(true)
    } else {
      setShouldAutoScroll(false)
    }
  }

  // Only reconnect if there's an active sync, don't auto-start new syncs
  useEffect(() => {
    if (isOpen && activeSyncId) {
      // Reconnect to existing sync
      reconnectToSync(activeSyncId)
    }
    
    // Reset state when modal opens fresh (but not if we just completed a sync)
    if (isOpen && !activeSyncId && !isComplete) {
      setLogs([])
      setIsRunning(false)
      setIsComplete(false)
      setHasError(false)
      setHasStarted(false)
      setSyncReport(null)
    }
    
    // Reset everything when modal closes
    if (!isOpen) {
      setLogs([])
      setIsRunning(false)
      setIsComplete(false)
      setHasError(false)
      setHasStarted(false)
      setSyncReport(null)
    }

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [isOpen, activeSyncId])

  const reconnectToSync = (syncId: string) => {
    setLogs([])
    setIsRunning(true)
    setIsComplete(false)
    setHasError(false)
    setHasStarted(true)

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `/api/sync-stream?syncId=${syncId}`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    setupEventSource(eventSource)
  }

  const startSync = () => {
    setLogs([])
    setIsRunning(true)
    setIsComplete(false)
    setHasError(false)
    setHasStarted(true)

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Build URL with granular parameters
    const params = new URLSearchParams()
    if (enableDiscovery) params.set('discovery', 'true')
    if (enableCleanup) params.set('cleanup', 'true')
    if (enableJobUpdate) params.set('updateExisting', 'true')
    if (enableNewJobs) params.set('addNew', 'true')
    if (selectedSources.length > 0) params.set('sources', selectedSources.join(','))
    
    const url = `/api/sync-stream?${params.toString()}`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    setupEventSource(eventSource)
  }

  const setupEventSource = (eventSource: EventSource) => {
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'sync_started') {
        const syncId = data.syncId
        onSyncStart(syncId)
      } else if (data.type === 'reconnect') {
        // Successfully reconnected
      } else if (data.type === 'log') {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: data.level || 'info',
          message: data.message
        }])
      } else if (data.type === 'complete') {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'success',
          message: `✨ Sync completed in ${(data.duration / 1000 / 60).toFixed(2)} minutes`
        }])
        setIsRunning(false)
        setIsComplete(true)
        
        // Invalidate all job-related queries to trigger UI refresh
        queryClient.invalidateQueries()
        
        onSyncComplete()
        eventSource.close()
      } else if (data.type === 'report') {
        // Store the sync report
        setSyncReport(data.report)
      } else if (data.type === 'error') {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          message: `❌ Error: ${data.message}`
        }])
        setHasError(true)
        setIsRunning(false)
        setIsComplete(true)
        onSyncComplete()
        eventSource.close()
      }
    }

    eventSource.onerror = () => {
      setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        message: '❌ Connection lost'
      }])
      setHasError(true)
      setIsRunning(false)
      setIsComplete(true)
      onSyncComplete()
      eventSource.close()
    }
  }

  const handleClose = () => {
    // Close connection when manually closing modal
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="sync-modal-overlay" onClick={handleClose}>
      <div className="sync-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sync-modal-header">
          <div className="sync-modal-title">
            {isRunning && <Loader2 className="spin" size={20} />}
            {isComplete && !hasError && <Check size={20} />}
            {hasError && <AlertCircle size={20} />}
            <span>Job Sync Terminal</span>
          </div>
          <button onClick={handleClose} className="sync-modal-close">
            <X size={20} />
          </button>
        </div>

        {/* Sync Options - Show before sync starts */}
        {!hasStarted && (
          <div className="sync-modal-options">
            <div className="options-section">
              <h4>Job Sources</h4>
              <div className="sources-grid">
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={selectedSources.includes('Greenhouse')}
                    onChange={() => toggleSource('Greenhouse')}
                  />
                  <span>Greenhouse</span>
                </label>
                
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={selectedSources.includes('Lever')}
                    onChange={() => toggleSource('Lever')}
                  />
                  <span>Lever</span>
                </label>
                
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={selectedSources.includes('Workable')}
                    onChange={() => toggleSource('Workable')}
                  />
                  <span>Workable</span>
                </label>
              </div>
            </div>
            
            <div className="options-section">
              <h4>Sync Options</h4>
              <div className="options-grid">
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={enableDiscovery}
                    onChange={(e) => setEnableDiscovery(e.target.checked)}
                  />
                  <span>Enable Discovery of New Companies</span>
                </label>
                
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={enableCleanup}
                    onChange={(e) => setEnableCleanup(e.target.checked)}
                  />
                  <span>Enable Cleanup of Nonexistant Companies</span>
                </label>
                
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={enableJobUpdate}
                    onChange={(e) => setEnableJobUpdate(e.target.checked)}
                  />
                  <span>Enable Update to Existing Jobs</span>
                </label>
                
                <label className="cleanup-checkbox">
                  <input 
                    type="checkbox" 
                    checked={enableNewJobs}
                    onChange={(e) => setEnableNewJobs(e.target.checked)}
                  />
                  <span>Find new jobs</span>
                </label>
              </div>
            </div>

            <button onClick={startSync} className="start-sync-btn" disabled={selectedSources.length === 0}>
              <Play size={18} />
              Start Sync {selectedSources.length > 0 && `(${selectedSources.length} sources)`}
            </button>
          </div>
        )}

        {/* Terminal Output */}
        <div className="sync-modal-terminal">
          <div className="terminal-header">
            <div className="terminal-buttons">
              <div className="terminal-button red"></div>
              <div className="terminal-button yellow"></div>
              <div className="terminal-button green"></div>
            </div>
            <div className="terminal-title">
              {isRunning ? 'Running...' : isComplete ? 'Complete' : hasStarted ? 'Waiting...' : 'Ready'}
            </div>
          </div>
          
          <div 
            className="terminal-body" 
            ref={terminalBodyRef}
            onScroll={handleScroll}
          >
            {!hasStarted && (
              <div className="terminal-ready">
                <p>👋 Ready to sync jobs!</p>
                <p>Configure options above and click "Start Sync" to begin.</p>
              </div>
            )}

            {logs.length === 0 && isRunning && (
              <div className="terminal-line info">
                <span className="timestamp">{new Date().toLocaleTimeString()}</span>
                <span className="message">🚀 Starting sync process...</span>
              </div>
            )}
            
            {logs.map((log, index) => (
              <div key={index} className={`terminal-line ${log.type}`}>
                <span className="timestamp">{log.timestamp}</span>
                <span className="message">{log.message}</span>
              </div>
            ))}
            
            {isRunning && (
              <div className="terminal-cursor">▊</div>
            )}
            
            <div ref={logsEndRef} />
          </div>

          {/* Jump to Bottom Button */}
          {!shouldAutoScroll && (
            <button 
              className="jump-to-bottom-btn"
              onClick={scrollToBottom}
              aria-label="Jump to bottom"
            >
              <ArrowDown size={16} />
              <span>Jump to Bottom</span>
            </button>
          )}
        </div>

        {/* Sync Report */}
        {syncReport && isComplete && (
          <div className="sync-report-panel">
            <h3 className="report-title">📊 Sync Report</h3>
            
            {/* Discovery Section */}
            {(syncReport.discovery.companiesTested > 0 || syncReport.discovery.companiesDiscovered > 0) && (
              <div className="report-section">
                <h4 className="report-section-title">🔍 Discovery</h4>
                <div className="report-stats">
                  <div className="report-stat">
                    <span className="stat-label">Companies Tested:</span>
                    <span className="stat-value">{syncReport.discovery.companiesTested}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">New Discovered:</span>
                    <span className="stat-value">{syncReport.discovery.companiesDiscovered}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">Added to Greenhouse:</span>
                    <span className="stat-value success">{syncReport.discovery.companiesAdded.greenhouse.length}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">Added to Lever:</span>
                    <span className="stat-value success">{syncReport.discovery.companiesAdded.lever.length}</span>
                  </div>
                  {(syncReport.discovery.companiesRemoved.greenhouse.length + syncReport.discovery.companiesRemoved.lever.length) > 0 && (
                    <div className="report-stat">
                      <span className="stat-label">Removed (404s):</span>
                      <span className="stat-value error">
                        {syncReport.discovery.companiesRemoved.greenhouse.length + syncReport.discovery.companiesRemoved.lever.length}
                      </span>
                    </div>
                  )}
                </div>
                
                {syncReport.discovery.companiesAdded.greenhouse.length > 0 && (
                  <div className="report-list">
                    <div className="list-label">✅ New Greenhouse companies:</div>
                    <div className="list-items">{syncReport.discovery.companiesAdded.greenhouse.join(', ')}</div>
                  </div>
                )}
                {syncReport.discovery.companiesAdded.lever.length > 0 && (
                  <div className="report-list">
                    <div className="list-label">✅ New Lever companies:</div>
                    <div className="list-items">{syncReport.discovery.companiesAdded.lever.join(', ')}</div>
                  </div>
                )}
              </div>
            )}
            
            {/* Jobs Section */}
            {syncReport.jobs.totalFetched > 0 && (
              <div className="report-section">
                <h4 className="report-section-title">💼 Jobs</h4>
                <div className="report-stats">
                  <div className="report-stat">
                    <span className="stat-label">Total Fetched:</span>
                    <span className="stat-value">{syncReport.jobs.totalFetched}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">New Jobs Added:</span>
                    <span className="stat-value success">{syncReport.jobs.added}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">Jobs Updated:</span>
                    <span className="stat-value">{syncReport.jobs.updated}</span>
                  </div>
                  <div className="report-stat">
                    <span className="stat-label">Skipped (duplicates):</span>
                    <span className="stat-value">{syncReport.jobs.skipped}</span>
                  </div>
                </div>
                
                {Object.keys(syncReport.jobs.bySource).length > 0 && (
                  <div className="report-subsection">
                    <div className="subsection-label">By Source:</div>
                    <div className="source-stats">
                      {Object.entries(syncReport.jobs.bySource).map(([source, count]) => (
                        <div key={source} className="source-stat">
                          <span>{source}:</span>
                          <span className="stat-value">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Top New Jobs */}
            {syncReport.topNewJobs.length > 0 && (
              <div className="report-section">
                <h4 className="report-section-title">🌟 Highlighted New Jobs</h4>
                <div className="top-jobs-list">
                  {syncReport.topNewJobs.map((job, i) => (
                    <div key={i} className="top-job">
                      <span className="job-info">{job.title} at {job.company}</span>
                      {job.salary && <span className="job-salary">{job.salary}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Duration */}
            {syncReport.duration && (
              <div className="report-footer">
                ⏱️ Total duration: {(syncReport.duration / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="sync-modal-footer">
          {isComplete && (
            <button onClick={handleClose} className="sync-modal-close-btn">
              Close
            </button>
          )}
          {isRunning && (
            <p className="sync-running-hint">
              You can close this modal - sync will continue in the background
            </p>
          )}
        </div>
      </div>

      <style>{`
        .sync-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6); /* Slate-900 with opacity */
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
          backdrop-filter: blur(4px);
        }

        .sync-modal {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 900px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          animation: modalSlideIn 0.3s ease-out;
          border: 1px solid #e2e8f0;
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .sync-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          background: white;
          border-radius: 16px 16px 0 0;
        }

        .sync-modal-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #1e293b;
          font-weight: 700;
          font-size: 1.25rem;
        }

        .sync-modal-close {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 8px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
        }

        .sync-modal-close:hover {
          background: #f1f5f9;
          color: #64748b;
        }

        .sync-modal-options {
          padding: 1.5rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .options-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        .cleanup-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #475569;
          cursor: pointer;
          font-size: 0.9375rem;
          font-weight: 500;
          padding: 0.5rem;
          border-radius: 8px;
          transition: background 0.2s;
        }
        
        .cleanup-checkbox:hover {
          background: #f1f5f9;
        }

        .cleanup-checkbox input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #10b981;
        }

        .cleanup-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: #999;
          font-style: italic;
        }

        .start-sync-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
        }

        .start-sync-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4);
        }

        .start-sync-btn:active {
          transform: translateY(0);
        }

        .sync-modal-terminal {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
          background: #f8fafc; /* Slate-50 */
        }

        .terminal-header {
          background: #f1f5f9; /* Slate-100 */
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .terminal-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .terminal-button {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .terminal-button.red { background: #ef4444; }
        .terminal-button.yellow { background: #f59e0b; }
        .terminal-button.green { background: #22c55e; }

        .terminal-title {
          color: #64748b;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: monospace;
        }

        .terminal-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          background: #f8fafc;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.9rem;
          line-height: 1.6;
          color: #334155;
        }

        .terminal-ready {
          color: #0ea5e9;
          text-align: center;
          padding: 2rem;
        }

        .terminal-ready p {
          margin: 0.5rem 0;
        }

        .terminal-body::-webkit-scrollbar {
          width: 10px;
        }

        .terminal-body::-webkit-scrollbar-track {
          background: #f8fafc;
        }

        .terminal-body::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border: 2px solid #f8fafc;
        }

        .terminal-body::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .terminal-line {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.375rem;
          align-items: flex-start;
        }

        .timestamp {
          color: #94a3b8;
          flex-shrink: 0;
          font-size: 0.8rem;
          min-width: 65px;
        }

        .message {
          flex: 1;
          word-break: break-word;
        }

        .terminal-line.info .message { color: #334155; }
        .terminal-line.success .message { color: #16a34a; }
        .terminal-line.error .message { color: #dc2626; }
        .terminal-line.warning .message { color: #d97706; }

        .terminal-cursor {
          color: #16a34a;
          animation: blink 1s infinite;
          margin-top: 0.5rem;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .sync-modal-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid #e2e8f0;
          background: white;
          border-radius: 0 0 16px 16px;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .sync-running-hint {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
          font-style: italic;
        }

        .sync-modal-close-btn {
          padding: 0.625rem 1.5rem;
          background: white;
          color: #475569;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .sync-modal-close-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #1e293b;
        }

        .spin {
          animation: spin 1s linear infinite;
          color: #10b981;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .sync-modal {
            max-width: 100%;
            max-height: 90vh;
            margin: 0.5rem;
          }

          .terminal-line {
            flex-direction: column;
            gap: 0.25rem;
          }

          .timestamp {
            font-size: 0.75rem;
          }
        }
          }
        }

        .jump-to-bottom-btn {
          position: absolute;
          bottom: 1.5rem;
          right: 2rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          background: #dbeafe; /* Blue-100 */
          color: #1e40af; /* Blue-800 */
          border: 1px solid #bfdbfe;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
          opacity: 1;
          z-index: 10;
        }

        .jump-to-bottom-btn:hover {
          transform: translateY(-2px);
          opacity: 1;
          background: #bfdbfe; /* Blue-200 */
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
        }

        .sync-report-panel {
          padding: 1.5rem;
          background: white;
          border-top: 1px solid #e2e8f0;
          max-height: 400px;
          overflow-y: auto;
        }

        .sync-report-panel::-webkit-scrollbar {
          width: 8px;
        }

        .sync-report-panel::-webkit-scrollbar-track {
          background: #f8fafc;
        }

        .sync-report-panel::-webkit-scrollbar-thumb  {
          background: #cbd5e1;
          border-radius: 4px;
        }

        .report-title {
          margin: 0 0 1.25rem 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #1e293b;
        }

        .report-section {
          margin-bottom: 1.5rem;
        }

        .report-section:last-child {
          margin-bottom: 0;
        }

        .report-section-title {
          margin: 0 0 0.75rem 0;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #f59e0b;
        }

        .report-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .report-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.625rem 0.875rem;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .stat-label {
          color: #64748b;
          font-weight: 500;
        }

        .stat-value {
          font-weight: 700;
          color: #334155;
        }

        .stat-value.success {
          color: #16a34a;
        }

        .stat-value.error {
          color: #dc2626;
        }

        .report-list {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #f0fdf4;
          border-radius: 6px;
          border: 1px solid #bbf7d0;
        }

        .list-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #15803d;
          margin-bottom: 0.5rem;
        }

        .list-items {
          font-size: 0.8125rem;
          color: #166534;
          line-height: 1.6;
        }

        .report-subsection {
          margin-top: 0.875rem;
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 6px;
        }

        .subsection-label {
          font-size: 0.8125rem;
          color: #64748b;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .source-stats {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .source-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.375rem 0.5rem;
          font-size: 0.875rem;
        }

        .source-stat span:first-child {
          color: #475569;
        }

        .top-jobs-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .top-job {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .job-info {
          color: #334155;
          font-weight: 500;
        }

        .job-salary {
          color: #16a34a;
          font-weight: 700;
          font-size: 0.8125rem;
        }

        .report-footer {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.875rem;
          color: #64748b;
          text-align: center;
        }
      `}</style>
    </div>
  )
}

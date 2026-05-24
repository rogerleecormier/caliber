/**
 * Job Pruning Modal Component
 * Allows users to preview and execute job pruning for each source
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, 
  Trash2, 
  AlertTriangle, 
  CheckCircle,
  Loader2,
  ExternalLink
} from 'lucide-react'

interface PruneResult {
  success: boolean
  dryRun: boolean
  sources: string
  jobsToDelete: number
  jobsDeleted: number
  orphanedJobs: Array<{
    id: number
    title: string
    company: string | null
    source: string
    url: string
  }>
  logs: string[]
  duration: number
  error?: string
}

interface PruneModalProps {
  isOpen: boolean
  onClose: () => void
  source: string
}

async function pruneJobs(source: string, dryRun: boolean): Promise<PruneResult> {
  const res = await fetch(`/api/v3/jobs/prune?source=${source}&dryRun=${dryRun}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export function PruneModal({ isOpen, onClose, source }: PruneModalProps) {
  const queryClient = useQueryClient()
  const [previewResult, setPreviewResult] = useState<PruneResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // Preview mutation (dry run)
  const previewMutation = useMutation({
    mutationFn: () => pruneJobs(source, true),
    onSuccess: (data) => {
      setPreviewResult(data)
    }
  })

  // Delete mutation (live)
  const deleteMutation = useMutation({
    mutationFn: () => pruneJobs(source, false),
    onSuccess: (data) => {
      setPreviewResult(data)
      setShowConfirm(false)
      // Refresh dashboard stats
      queryClient.invalidateQueries({ queryKey: ['sync-stats'] })
    }
  })

  const handleClose = () => {
    setPreviewResult(null)
    setShowConfirm(false)
    onClose()
  }

  if (!isOpen) return null

  const sourceIcons: Record<string, string> = {
    Greenhouse: '🏢',
    Lever: '🔧',
    Workable: '💼'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-red-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Prune {sourceIcons[source]} {source} Jobs
              </h2>
              <p className="text-sm text-slate-600">
                Remove jobs that no longer exist on the platform
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!previewResult ? (
            // Initial state - show preview button
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Preview Stale Jobs
              </h3>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                This will check which {source} jobs in your database no longer exist on the platform.
                No jobs will be deleted until you confirm.
              </p>
              <button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Preview Stale Jobs
                  </>
                )}
              </button>
            </div>
          ) : (
            // Preview results
            <div>
              {/* Summary */}
              <div className={`rounded-lg p-4 mb-4 ${
                previewResult.jobsToDelete > 0 
                  ? 'bg-yellow-50 border border-yellow-200' 
                  : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-start gap-3">
                  {previewResult.jobsToDelete > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {previewResult.jobsDeleted > 0 
                        ? `Deleted ${previewResult.jobsDeleted} stale jobs`
                        : previewResult.jobsToDelete > 0
                        ? `Found ${previewResult.jobsToDelete} stale jobs`
                        : 'No stale jobs found'
                      }
                    </h3>
                    <p className="text-sm text-slate-600">
                      {previewResult.jobsDeleted > 0
                        ? `Successfully removed ${previewResult.jobsDeleted} jobs that no longer exist on ${source}.`
                        : previewResult.jobsToDelete > 0
                        ? `These jobs exist in your database but are no longer available on ${source}.`
                        : `All ${source} jobs in your database are still active on the platform.`
                      }
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Completed in {previewResult.duration}ms
                    </p>
                  </div>
                </div>
              </div>

              {/* Orphaned Jobs List */}
              {previewResult.orphanedJobs.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold text-slate-900 mb-3">
                    {previewResult.jobsDeleted > 0 ? 'Deleted Jobs' : 'Jobs to Delete'}
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {previewResult.orphanedJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-slate-900 truncate">
                              {job.title}
                            </div>
                            <div className="text-xs text-slate-600">
                              {job.company || 'Unknown Company'}
                            </div>
                          </div>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 flex-shrink-0"
                            title="View source URL"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {previewResult.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-900 mb-1">Error</h4>
                      <p className="text-sm text-red-700">{previewResult.error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-slate-50 flex items-center justify-between gap-4">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
          
          {previewResult && previewResult.jobsToDelete > 0 && !previewResult.jobsDeleted && (
            <div className="flex items-center gap-3">
              {!showConfirm ? (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete {previewResult.jobsToDelete} Jobs
                </button>
              ) : (
                <>
                  <span className="text-sm text-slate-600">Are you sure?</span>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="px-4 py-2 text-slate-700 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {deleteMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Confirm Delete
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

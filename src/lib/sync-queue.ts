/**
 * TanStack Pacer-based Sync Queue System
 * Provides priority-based queueing, rate limiting, and retry logic
 */

import { asyncThrottle } from '@tanstack/pacer'

// ============================================
// Types
// ============================================

export interface SyncWorkItem {
  id: string
  source: 'greenhouse' | 'lever' | 'workable'
  company?: string  // For ATS sources
  priority: number  // Higher = process first
  retryCount: number
  maxRetries: number
  createdAt: Date
}

export interface SyncResult {
  success: boolean
  source: string
  company?: string
  jobsAdded: number
  jobsUpdated: number
  jobsDeleted: number
  error?: string
  duration: number
}

export interface SyncLogEntry {
  timestamp: string
  level: 'info' | 'success' | 'error' | 'warning'
  source: string
  message: string
  details?: Record<string, any>
}

// ============================================
// Throttled Fetchers (per-source rate limiting)
// ============================================

const createSourceFetcher = (sourceId: string, waitMs: number = 500) => {
  return asyncThrottle(
    async (url: string, options?: RequestInit): Promise<Response> => {
      console.log(`[${sourceId}] Fetching: ${url}`)
      const response = await fetch(url, options)
      return response
    },
    {
      wait: waitMs,
      leading: true,
      trailing: false
    }
  )
}

// Per-source throttled fetchers
export const sourceFetchers = {
  greenhouse: createSourceFetcher('greenhouse', 1000),  // 1 req/sec
  lever: createSourceFetcher('lever', 1000),
  workable: createSourceFetcher('workable', 1000)     // 1 req/sec for Workable
}

// ============================================
// Sync Queue Manager
// ============================================

export class SyncQueueManager {
  private logs: SyncLogEntry[] = []
  private maxLogs = 100
  
  constructor() {}
  
  log(level: SyncLogEntry['level'], source: string, message: string, details?: Record<string, any>) {
    const entry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details
    }
    
    this.logs.unshift(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }
    
    // Also console log for worker visibility
    const emoji = level === 'success' ? '✅' : level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`[${source}] ${emoji} ${message}`)
    
    return entry
  }
  
  getLogs(): SyncLogEntry[] {
    return [...this.logs]
  }
  
  clearLogs() {
    this.logs = []
  }
}

// Singleton instance
export const syncQueue = new SyncQueueManager()

// ============================================
// Batch State Management
// ============================================

export interface BatchState {
  atsIndex: number        // Current index in ATS companies
  lastAtsSource: 'greenhouse' | 'lever' | 'workable'
  lastUpdated: Date
}

// ATS sources rotate in order: greenhouse -> lever -> workable -> greenhouse...
const ATS_SOURCE_ORDER = ['greenhouse', 'lever', 'workable'] as const

export function getNextAtsSource(lastSource: 'greenhouse' | 'lever' | 'workable'): 'greenhouse' | 'lever' | 'workable' {
  const currentIndex = ATS_SOURCE_ORDER.indexOf(lastSource)
  const nextIndex = (currentIndex + 1) % ATS_SOURCE_ORDER.length
  return ATS_SOURCE_ORDER[nextIndex]
}

// ============================================
// Retry Logic with Exponential Backoff
// ============================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000, onRetry } = options
  
  let lastError: Error | undefined
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
        onRetry?.(attempt + 1, lastError)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError
}

// ============================================
// Source Statistics
// ============================================

export interface SourceStats {
  source: string
  lastSync: Date | null
  lastStatus: 'running' | 'completed' | 'failed' | 'never'
  jobsAdded: number
  jobsUpdated: number
  totalJobs: number
  errorMessage?: string
}

export function createEmptyStats(source: string): SourceStats {
  return {
    source,
    lastSync: null,
    lastStatus: 'never',
    jobsAdded: 0,
    jobsUpdated: 0,
    totalJobs: 0
  }
}

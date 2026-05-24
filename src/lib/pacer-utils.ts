/**
 * Pacer Utilities - TanStack Pacer Integration
 * 
 * Thin wrappers around @tanstack/pacer primitives optimized for 
 * Cloudflare Workers with 10ms CPU limit
 */

import { 
  asyncThrottle,
  AsyncQueuer,
  type AsyncThrottlerOptions
} from '@tanstack/pacer'

/**
 * Configuration for throttled API fetching
 */
export interface ThrottledFetcherConfig {
  /** Time to wait between executions in milliseconds */
  wait?: number
  /** Maximum number of retries on failure */
  maxRetries?: number
  /** Base delay for exponential backoff in milliseconds */
  retryDelay?: number
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * Creates a throttled fetch function optimized for Cloudflare Workers
 * Uses TanStack Pacer's asyncThrottle under the hood
 */
export function createThrottledFetcher(config: ThrottledFetcherConfig = {}) {
  const {
    wait = 500,
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 5000
  } = config

  const throttledFn = asyncThrottle(
    async (url: string, options?: RequestInit): Promise<Response> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })
        return response
      } finally {
        clearTimeout(timeoutId)
      }
    },
    { wait }
  )

  // Wrap with retry logic
  return async (url: string, options?: RequestInit): Promise<Response> => {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await throttledFn(url, options)
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay * Math.pow(2, attempt)
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }
        
        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw lastError || new Error('Fetch failed after retries')
  }
}

/**
 * Configuration for rate-limited fetching
 */
export interface RateLimitedFetcherConfig extends ThrottledFetcherConfig {
  /** Maximum requests per window */
  maxRequests?: number
  /** Window duration in milliseconds */
  windowMs?: number
}

/**
 * Creates a throttled + rate-limited fetcher
 * Combines TanStack Pacer throttling with simple rate limit tracking
 */
export function createThrottledRateLimitedFetcher(config: {
  throttle?: ThrottledFetcherConfig
  rateLimit?: { maxRequests?: number; windowMs?: number }
} = {}) {
  const throttledFetch = createThrottledFetcher(config.throttle)
  const maxRequests = config.rateLimit?.maxRequests ?? 60
  const windowMs = config.rateLimit?.windowMs ?? 60000
  
  const requests: number[] = []
  
  return async (url: string, options?: RequestInit): Promise<Response> => {
    const now = Date.now()
    
    // Clean old requests
    while (requests.length > 0 && requests[0] < now - windowMs) {
      requests.shift()
    }
    
    // Check rate limit
    if (requests.length >= maxRequests) {
      const waitTime = requests[0] + windowMs - now + 100
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    requests.push(Date.now())
    return throttledFetch(url, options)
  }
}

/**
 * Configuration for queued database operations
 */
export interface BatchedDbWriterConfig<T> {
  /** Maximum number of items in a batch before flushing */
  maxSize?: number
  /** Maximum time to wait before flushing a batch in milliseconds */
  wait?: number
  /** Function to execute the batch write */
  writeFn: (items: T[]) => Promise<void>
  /** Optional callback for errors */
  onError?: (error: Error, items: T[]) => void
  /** Optional callback for batch completion */
  onBatchComplete?: (items: T[], success: boolean) => void
}

/**
 * Creates a batched database writer using TanStack Pacer's AsyncQueuer
 * Optimized for D1's parameter limits
 */
export function createBatchedDbWriter<T>(config: BatchedDbWriterConfig<T>) {
  const { 
    maxSize = 5,  // D1 parameter limit safe 
    wait = 100,
    writeFn, 
    onError,
    onBatchComplete 
  } = config
  
  let batch: T[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let isProcessing = false
  
  const processBatch = async (items: T[]) => {
    if (items.length === 0) return
    isProcessing = true
    
    try {
      await writeFn(items)
      onBatchComplete?.(items, true)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      onError?.(err, items)
      onBatchComplete?.(items, false)
      throw err
    } finally {
      isProcessing = false
    }
  }
  
  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(async () => {
      if (batch.length > 0) {
        const toProcess = [...batch]
        batch = []
        try {
          await processBatch(toProcess)
        } catch (e) {
          // Error handled in processBatch
        }
      }
    }, wait)
  }
  
  return {
    add: async (item: T) => {
      batch.push(item)
      
      if (batch.length >= maxSize) {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        const toProcess = [...batch]
        batch = []
        await processBatch(toProcess)
      } else {
        scheduleFlush()
      }
    },
    
    flush: async () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      
      while (isProcessing) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      if (batch.length > 0) {
        const toProcess = [...batch]
        batch = []
        await processBatch(toProcess)
      }
    },
    
    size: () => batch.length,
    isProcessing: () => isProcessing
  }
}

/**
 * Creates a write queue using TanStack Pacer's AsyncQueuer
 * For sequential database operations with backpressure
 */
export function createWriteQueue<T>(
  writeFn: (item: T) => Promise<void>,
  options: { concurrency?: number; wait?: number; maxSize?: number } = {}
) {
  const { concurrency = 1, wait = 50, maxSize = 100 } = options
  
  const queue = new AsyncQueuer<T>({
    concurrency,
    wait,
    maxSize
  })
  
  return {
    add: (item: T) => queue.add(async () => writeFn(item)),
    onIdle: () => queue.onIdle(),
    size: () => queue.size,
    isPending: () => queue.isPending
  }
}

// Legacy exports for backwards compatibility
export { createThrottledFetcher as createRateLimiter }

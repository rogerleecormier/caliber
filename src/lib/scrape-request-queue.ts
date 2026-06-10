/**
 * Scrape Request Queue
 *
 * Defines message types and helpers for the scrape-request-queue.
 * API routes dispatch scrape requests here instead of making synchronous
 * calls to ATS platforms, allowing async workers to fetch content
 * without blocking the main request path.
 */

type Queue<T> = any

/**
 * Scrape request message — sent when job content is needed from ATS platforms
 */
export interface ScrapeRequestMessage {
  type: 'scrape_job_content'
  source: 'greenhouse' | 'lever' | 'workable'
  jobId: string
  sourceUrl: string
  company: string
  // Optional: job ID in the ATS system if already extracted
  atsJobId?: string
}

/**
 * Union type for all scrape request messages
 */
export type ScrapeRequestQueueMessage = ScrapeRequestMessage

/**
 * Dispatch a scrape request to the queue. Logs errors but does not throw,
 * so that queue unavailability doesn't crash the API request.
 */
export async function enqueueScrapeRequest(
  queue: Queue<ScrapeRequestQueueMessage>,
  message: ScrapeRequestMessage,
): Promise<void> {
  try {
    await queue.send(message)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(
      `[scrape-request-queue] Failed to enqueue ${message.type}:`,
      errorMsg,
      { jobId: message.jobId, source: message.source },
    )
  }
}

/**
 * Scrape Request Queue Consumer
 *
 * Processes messages from the scrape-request-queue asynchronously,
 * fetching job content from ATS platforms (Greenhouse, Lever, Workable)
 * and storing results in D1 via the job-ingestion-queue.
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'
import { enqueueJobIngestion, type AtsJobMessage } from '@/lib/job-ingestion-queue'
import { decodeHtmlEntities } from '@/lib/html-utils'
import type { ScrapeRequestQueueMessage } from '@/lib/scrape-request-queue'

/**
 * Extract Greenhouse job ID from URL
 */
function extractGreenhouseJobId(sourceUrl: string): { boardToken: string; jobId: string } | null {
  const match = sourceUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/i)
  if (match?.[1] && match?.[2]) {
    return { boardToken: match[1], jobId: match[2] }
  }

  const idMatch = sourceUrl.match(/\/jobs\/(\d+)/i)
  if (idMatch?.[1]) {
    const boardMatch = sourceUrl.match(/https?:\/\/([^.]+)\.greenhouse/)
    return {
      boardToken: boardMatch?.[1] || 'unknown',
      jobId: idMatch[1]
    }
  }
  return null
}

/**
 * Extract Lever job ID from URL
 */
function extractLeverJobId(sourceUrl: string): { companySlug: string; jobId: string } | null {
  const match = sourceUrl.match(/lever\.co\/([^\/]+)\/([a-zA-Z0-9-]+)/i)
  if (match?.[1] && match?.[2]) {
    return { companySlug: match[1], jobId: match[2] }
  }
  return null
}

/**
 * Extract Workable account and job shortcode from URL
 */
function extractWorkableJobId(sourceUrl: string): { account: string; shortcode: string } | null {
  const match = sourceUrl.match(/apply\.workable\.com\/([^\/]+)\/j\/([a-zA-Z0-9]+)/i)
  if (match?.[1] && match?.[2]) {
    return { account: match[1], shortcode: match[2] }
  }
  return null
}

/**
 * Fetch Greenhouse job content via API
 */
async function fetchGreenhouseContent(
  boardToken: string,
  jobId: string
): Promise<string | null> {
  try {
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      console.error(`[scrape-consumer] Greenhouse API error: ${response.status}`)
      return null
    }

    const data = (await response.json()) as any
    return decodeHtmlEntities(data.content || '')
  } catch (error) {
    console.error('[scrape-consumer] Greenhouse fetch failed:', error)
    return null
  }
}

/**
 * Fetch Lever job content via API
 */
async function fetchLeverContent(
  companySlug: string,
  jobId: string
): Promise<string | null> {
  try {
    const apiUrl = `https://api.lever.co/v0/postings/${companySlug}/${jobId}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      console.error(`[scrape-consumer] Lever API error: ${response.status}`)
      return null
    }

    const data = (await response.json()) as any
    let content = data.description || ''

    if (data.lists && Array.isArray(data.lists)) {
      for (const list of data.lists) {
        content += `<h3>${list.text}</h3><ul>${list.content || ''}</ul>`
      }
    }
    if (data.additional) {
      content += `<p>${data.additional}</p>`
    }

    return content
  } catch (error) {
    console.error('[scrape-consumer] Lever fetch failed:', error)
    return null
  }
}

/**
 * Fetch Workable job content via per-job widget API
 */
async function fetchWorkableContent(
  account: string,
  shortcode: string
): Promise<string | null> {
  try {
    const apiUrl = `https://apply.workable.com/api/v1/widget/accounts/${account}/jobs/${shortcode}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      console.error(`[scrape-consumer] Workable API error: ${response.status}`)
      return null
    }

    const data = (await response.json()) as any
    return decodeHtmlEntities(data.description || data.full_description || '')
  } catch (error) {
    console.error('[scrape-consumer] Workable fetch failed:', error)
    return null
  }
}

/**
 * Process a single scrape request and enqueue result for ingestion
 */
export async function processScrapeRequest(
  db: DrizzleD1Database,
  ingestionQueue: Queue<any>,
  message: ScrapeRequestQueueMessage
): Promise<void> {
  if (message.type !== 'scrape_job_content') {
    console.warn('[scrape-consumer] Unknown message type:', message.type)
    return
  }

  const { source, sourceUrl, company, jobId } = message
  let content: string | null = null

  try {
    if (source === 'greenhouse') {
      const ids = extractGreenhouseJobId(sourceUrl)
      if (ids) {
        content = await fetchGreenhouseContent(ids.boardToken, ids.jobId)
      } else {
        throw new Error('Could not extract Greenhouse job ID from URL')
      }
    } else if (source === 'lever') {
      const ids = extractLeverJobId(sourceUrl)
      if (ids) {
        content = await fetchLeverContent(ids.companySlug, ids.jobId)
      } else {
        throw new Error('Could not extract Lever job ID from URL')
      }
    } else if (source === 'workable') {
      const ids = extractWorkableJobId(sourceUrl)
      if (ids) {
        content = await fetchWorkableContent(ids.account, ids.shortcode)
      } else {
        throw new Error('Could not extract Workable job ID from URL')
      }
    } else {
      throw new Error(`Unsupported source: ${source}`)
    }

    if (!content) {
      throw new Error(`Failed to fetch content from ${source}`)
    }

    // Create job ingestion message with fetched content
    const atsMsg: AtsJobMessage = {
      type: 'ats_job',
      source,
      company,
      payload: {
        title: '', // Will be filled in by ingestion consumer if available
        description: content,
        sourceUrl,
        sourceName: source === 'greenhouse' ? 'Greenhouse' : source === 'lever' ? 'Lever' : 'Workable',
        postDate: null
      }
    }

    // Enqueue for D1 ingestion
    await enqueueJobIngestion(ingestionQueue, atsMsg)
    console.log(`[scrape-consumer] Successfully scraped and queued job: ${jobId} from ${source}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[scrape-consumer] Failed to scrape job ${jobId}:`, errorMsg)
    throw error
  }
}

/**
 * Process a batch of scrape requests sequentially
 */
export async function processScrapeRequestBatch(
  db: DrizzleD1Database,
  ingestionQueue: Queue<any>,
  batch: MessageBatch<ScrapeRequestQueueMessage>
): Promise<void> {
  let successCount = 0
  let failureCount = 0

  for (const message of batch.messages) {
    try {
      await processScrapeRequest(db, ingestionQueue, message.body)
      message.ack()
      successCount++
    } catch (error) {
      failureCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[scrape-consumer] Failed to process scrape request:', errorMsg)
      message.retry()
    }
  }

  console.log(
    `[scrape-consumer] Batch complete: ${successCount} ack'd, ${failureCount} retry'd`
  )
}

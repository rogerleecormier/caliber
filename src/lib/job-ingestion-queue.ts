/**
 * Job Ingestion Queue
 *
 * Defines message types and helpers for the job-ingestion-queue.
 * Scrapers publish raw job payloads here instead of writing directly to D1,
 * allowing a single consumer to process writes sequentially and avoid
 * SQLite single-writer lock contention.
 */

import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search'

/**
 * ATS job message — sent by the ATS sync worker (Greenhouse/Lever/Workable)
 */
export interface AtsJobMessage {
  type: 'ats_job'
  source: 'greenhouse' | 'lever' | 'workable'
  company: string
  payload: {
    title: string
    description: string
    sourceUrl: string
    sourceName: 'Greenhouse' | 'Lever' | 'Workable'
    postDate: string | null
  }
}

/**
 * Pipeline job message — sent by LinkedIn search cron
 */
export interface PipelineJobMessage {
  type: 'pipeline_job'
  userId: string
  savedSearchId: number | null
  searchUrl: string
  criteria: LinkedInSearchParams
  job: LinkedInScrapedJob
  shouldBackfillWorkplaceType?: boolean
}

/**
 * Greenhouse org discovery message — sent when Greenhouse URLs are detected
 */
export interface GreenhouseOrgMessage {
  type: 'greenhouse_org_discovery'
  payload: string
}

/**
 * Union type for all job ingestion messages
 */
export type JobIngestionMessage = AtsJobMessage | PipelineJobMessage | GreenhouseOrgMessage

/**
 * Enqueue a job for ingestion. Logs errors but does not throw,
 * so that queue unavailability doesn't crash the scraper loop.
 */
export async function enqueueJobIngestion(
  queue: Queue<JobIngestionMessage>,
  message: JobIngestionMessage,
): Promise<void> {
  try {
    await queue.send(message)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(
      `[job-ingestion-queue] Failed to enqueue ${message.type}:`,
      errorMsg,
      { messageType: message.type },
    )
  }
}

/**
 * Enqueue a Greenhouse org discovery request. Extracts orgs from payload
 * and queues for async processing by the greenhouse-org-consumer.
 */
export async function enqueueGreenhouseOrgDiscovery(
  queue: Queue<JobIngestionMessage>,
  payload: string,
): Promise<void> {
  if (!payload || payload.trim() === '') {
    console.warn('[job-ingestion-queue] Empty payload for Greenhouse org discovery, skipping')
    return
  }

  try {
    await enqueueJobIngestion(queue, {
      type: 'greenhouse_org_discovery',
      payload,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(
      '[job-ingestion-queue] Failed to enqueue Greenhouse org discovery:',
      errorMsg,
    )
  }
}

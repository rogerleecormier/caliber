/**
 * V3 Job Content Endpoint (Event-Driven)
 * Queries D1 exclusively — no synchronous API calls to ATS platforms.
 * Dispatches async scrape_request queue events when fresh content is needed.
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getDbFromContext, schema } from '../../../db/db'
import { eq } from 'drizzle-orm'
import { sanitizeHtml } from '../../../lib/html-utils'
import { enqueueScrapeRequest, type ScrapeRequestMessage } from '../../../lib/scrape-request-queue'
import { getCloudflareEnv } from '../../../lib/cloudflare'

type SourceType = 'greenhouse' | 'lever' | 'workable'

function extractSourceType(sourceUrl: string): SourceType | null {
  const lower = sourceUrl.toLowerCase()
  if (lower.includes('greenhouse')) return 'greenhouse'
  if (lower.includes('lever.co')) return 'lever'
  if (lower.includes('workable.com')) return 'workable'
  return null
}

export const Route = createFileRoute('/api/v3/job-content')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const url = new URL(request.url)
        const sourceUrl = url.searchParams.get('url')
        const company = url.searchParams.get('company')

        if (!sourceUrl || !company) {
          return json({ error: 'Missing url or company' }, { status: 400 })
        }

        try {
          const ctx = context as any
          const db = await getDbFromContext(ctx)

          // Query D1 exclusively
          const existingJob = await db.select()
            .from(schema.normalizedJobs)
            .where(eq(schema.normalizedJobs.sourceUrl, sourceUrl))
            .get()

          // Return cached full description if available
          if (existingJob?.description) {
            const reprocessed = sanitizeHtml(existingJob.description)
            return json({ content: reprocessed, fromCache: true }, {
              headers: {
                'Cache-Control': 'public, max-age=3600',
                'X-Api-Version': 'v3'
              }
            })
          }

          // Content not in D1 yet — dispatch async scrape request
          // but return immediately with pending status
          const sourceType = extractSourceType(sourceUrl)
          if (sourceType) {
            try {
              const env = getCloudflareEnv() as any
              if (env.SCRAPE_REQUEST_QUEUE) {
                const scrapeMsg: ScrapeRequestMessage = {
                  type: 'scrape_job_content',
                  source: sourceType,
                  jobId: existingJob?.id ? String(existingJob.id) : `${sourceUrl}:${Date.now()}`,
                  sourceUrl,
                  company,
                }
                await enqueueScrapeRequest(env.SCRAPE_REQUEST_QUEUE, scrapeMsg)
              }
            } catch (err) {
              console.warn('[job-content] Failed to dispatch scrape request:', err)
            }
          }

          // Return empty content with pending indicator
          return json({
            content: '',
            pending: true,
            message: 'Content is being fetched asynchronously. Please refresh shortly.'
          }, {
            headers: {
              'Cache-Control': 'no-cache',
              'X-Api-Version': 'v3'
            },
            status: 202
          })
        } catch (error) {
          console.error('Job content error:', error)
          return json({
            error: 'Failed to fetch content',
            details: error instanceof Error ? error.message : String(error)
          }, { status: 500 })
        }
      }
    }
  }
})

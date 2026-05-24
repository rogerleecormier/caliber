/**
 * Worker Sync Logic
 * 
 * Shared sync logic for Cloudflare Workers that bypasses the HTTP layer
 * and writes directly to D1. This eliminates cold start issues from
 * hitting the TanStack website.
 */

import type { DrizzleD1Database } from '../db/db'
import * as schema from '../db/schema'
import { sql, eq, inArray } from 'drizzle-orm'
import { determineCategoryId } from './job-sources'
import { decodeHtmlEntities } from './html-utils'

// Import company lists
import greenhouseCompanies from './job-sources/greenhouse-companies.json'
import leverCompanies from './job-sources/lever-companies.json'
import workableCompanies from './job-sources/workable-companies.json'

// ============================================
// Types
// ============================================

interface CompanyDatabase {
  categories: { [key: string]: { companies: string[] } }
}

export interface SyncResult {
  success: boolean
  source: string
  company?: string
  tag?: string
  jobsAdded: number
  jobsUpdated: number
  error?: string
  duration: number
}

export interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

// ============================================
// Utility Functions
// ============================================

function getGreenhouseCompanies(): string[] {
  const data = greenhouseCompanies as CompanyDatabase
  const all: string[] = []
  Object.values(data.categories).forEach(cat => all.push(...cat.companies))
  return [...new Set(all)]
}

function getLeverCompanies(): string[] {
  const data = leverCompanies as CompanyDatabase
  const all: string[] = []
  Object.values(data.categories).forEach(cat => all.push(...cat.companies))
  return [...new Set(all)]
}

function getWorkableCompanies(): string[] {
  const data = workableCompanies as CompanyDatabase
  const all: string[] = []
  Object.values(data.categories).forEach(cat => all.push(...cat.companies))
  return [...new Set(all)]
}

// ATS source rotation order
const ATS_SOURCES = ['greenhouse', 'lever', 'workable'] as const
type AtsSource = typeof ATS_SOURCES[number]

function getNextAtsSource(lastSource: AtsSource): AtsSource {
  const currentIndex = ATS_SOURCES.indexOf(lastSource)
  const nextIndex = (currentIndex + 1) % ATS_SOURCES.length
  return ATS_SOURCES[nextIndex]
}

function getCompaniesForSource(source: AtsSource): string[] {
  switch (source) {
    case 'greenhouse': return getGreenhouseCompanies()
    case 'lever': return getLeverCompanies()
    case 'workable': return getWorkableCompanies()
  }
}


function createLog(type: LogEntry['type'], message: string): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    type,
    message
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// RemoteOK tags for rotation
const REMOTEOK_TAGS = [
  'dev', 'engineer', 'devops', 'design', 'marketing',
  'developer', 'frontend', 'backend', 'fullstack',
  'product', 'project', 'data', 'support',
  'program', 'cloud', 'sysadmin', 'customer_success'
]

// ============================================
// Error State Reporting
// ============================================

/**
 * Marks a sync as failed in the syncHistory table.
 * This ensures the UI shows 'failed' instead of stuck 'running'.
 */
export async function markSyncFailed(
  db: DrizzleD1Database,
  syncId: string,
  error: unknown,
  logs: LogEntry[] = []
): Promise<void> {
  const errorMsg = error instanceof Error ? error.message : String(error)

  try {
    await db.update(schema.syncHistory).set({
      status: 'failed',
      completedAt: new Date(),
      logs: [...logs, createLog('error', `Fatal error: ${errorMsg}`)].slice(0, 20),
      stats: { jobsAdded: 0, jobsUpdated: 0, jobsDeleted: 0, error: errorMsg } as any
    }).where(eq(schema.syncHistory.id, syncId))
  } catch (updateError) {
    console.error('Failed to mark sync as failed:', updateError)
  }
}

// ============================================
// ATS Sync Logic (Greenhouse/Lever)
// ============================================

export async function syncAtsCompany(
  db: DrizzleD1Database,
  timeStr: string
): Promise<SyncResult> {
  const syncId = crypto.randomUUID()
  const startTime = Date.now()
  const logs: LogEntry[] = []

  const log = (type: LogEntry['type'], message: string) => {
    logs.push(createLog(type, message))
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`[${timeStr}] ${emoji} ${message}`)
  }

  // Initialize variables outside try block for error handling scope
  let source: AtsSource = 'workable'
  let company = ''
  let nextIndex = 0
  let atsIndex = 0

  try {
    // Get batch state to determine which company to sync
    let batchState = await db.select()
      .from(schema.syncHistory)
      .where(sql`status = 'batch_state' AND sync_type = 'ats'`)
      .limit(1)

    let lastSource: AtsSource = 'workable' // Start with workable so first run goes to greenhouse

    if (batchState.length > 0 && batchState[0].stats) {
      const state = batchState[0].stats as any
      atsIndex = state.atsIndex || 0
      lastSource = state.lastSource || 'workable'
    }

    // Rotate through 3 sources: greenhouse -> lever -> workable -> greenhouse...
    source = getNextAtsSource(lastSource)

    // Check if Workable is in cooldown from previous rate limit
    if (source === 'workable' && batchState.length > 0 && batchState[0].stats) {
      const state = batchState[0].stats as any
      if (state.workableCooldownUntil) {
        const cooldownEnd = new Date(state.workableCooldownUntil)
        if (cooldownEnd > new Date()) {
          const remainingSecs = Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000)
          log('warning', `Workable in cooldown (${remainingSecs}s remaining), skipping to greenhouse`)
          // Skip Workable, go to greenhouse instead
          source = 'greenhouse'
          // Don't advance atsIndex - we want to try the same Workable company later
        } else {
          // Cooldown expired, clear it
          log('info', `Workable cooldown expired, resuming normal sync`)
        }
      }
    }

    const companies = getCompaniesForSource(source)

    // Get next company
    if (atsIndex >= companies.length) {
      atsIndex = 0
    }

    company = companies[atsIndex]
    nextIndex = atsIndex + 1

    log('info', `Starting sync for ${company}`)
    log('info', `Company index: ${atsIndex}/${companies.length}, source: ${source}`)

    // Create sync history record
    await db.insert(schema.syncHistory).values({
      id: syncId,
      syncType: 'job_sync',
      source: source,
      status: 'running',
      startedAt: new Date(),
      logs: [createLog('info', `Syncing ${company}`)],
      stats: {
        jobsAdded: 0,
        jobsUpdated: 0,
        jobsDeleted: 0,
        company,
        companyIndex: atsIndex,
        totalCompanies: companies.length
      } as any
    })

    let jobsAdded = 0
    let jobsUpdated = 0

    // Fetch jobs from source
    let apiUrl: string
    switch (source) {
      case 'greenhouse':
        apiUrl = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`
        break
      case 'lever':
        apiUrl = `https://api.lever.co/v0/postings/${company}`
        break
      case 'workable':
        apiUrl = `https://apply.workable.com/api/v1/widget/accounts/${company}`
        break
    }

    log('info', `API: ${apiUrl}`)

    const response = await fetch(apiUrl)
    log('info', `HTTP ${response.status} ${response.statusText}`)

    if (!response.ok) {
      if (response.status === 404) {
        log('warning', `${company}: No job board found (HTTP 404) - recycling for re-discovery`)

        // Self-cleanup: Remove from discovered companies and add to potential for re-discovery
        try {
          // Delete from discovered_companies (company may have left this ATS)
          await db.delete(schema.discoveredCompanies)
            .where(eq(schema.discoveredCompanies.slug, company))

          // Add to potential_companies for re-discovery on different ATS
          // Use INSERT OR IGNORE to handle if already exists
          await db.insert(schema.potentialCompanies).values({
            id: crypto.randomUUID(),
            slug: company,
            status: 'pending',
            checkCount: 0
          }).onConflictDoUpdate({
            target: schema.potentialCompanies.slug,
            set: {
              status: 'pending',
              lastCheckedAt: new Date()
            }
          })

          log('success', `${company}: Recycled for re-discovery`)
        } catch (recycleError) {
          log('warning', `${company}: Failed to recycle - ${recycleError}`)
        }
        // Continue to update batch state
      } else if (response.status === 429) {
        // Handle rate limit - set cooldown and skip
        const resetHeader = response.headers.get('X-Rate-Limit-Reset')
        let cooldownSeconds = 120 // Default 2 minute cooldown

        if (resetHeader) {
          // Workable returns seconds until reset
          const parsed = parseInt(resetHeader, 10)
          if (!isNaN(parsed)) {
            cooldownSeconds = parsed + 10 // Add 10s buffer
          }
        }

        const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString()
        log('warning', `${source} rate limited (429). Cooldown for ${cooldownSeconds}s until ${cooldownUntil}`)

        // Set cooldown in batch state (only for Workable)
        if (source === 'workable') {
          await updateAtsBatchState(db, source, atsIndex, cooldownUntil) // Don't advance index
        } else {
          await updateAtsBatchState(db, source, nextIndex)
        }

        // Mark sync as failed gracefully
        await markSyncFailed(db, syncId, `Rate limit hit (429)`, logs)

        return {
          success: false,
          source,
          company,
          jobsAdded: 0,
          jobsUpdated: 0,
          error: 'Rate limit hit (429)',
          duration: Date.now() - startTime
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } else {
      // Check content-type
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        log('warning', `${company}: Invalid content-type: ${contentType.substring(0, 50)}`)
      } else {
        const data = await response.json() as any
        let jobs: any[]

        // Parse jobs based on source format
        switch (source) {
          case 'greenhouse':
            jobs = data.jobs || []
            break
          case 'lever':
            jobs = data || []
            break
          case 'workable':
            jobs = data.jobs || []
            break
        }

        log('info', `Total jobs from API: ${jobs.length}`)

        // Filter for remote jobs
        const remoteJobs = jobs.filter((job: any) => {
          if (source === 'greenhouse') {
            const loc = job.location?.name?.toLowerCase() || ''
            return loc.includes('remote') || loc.includes('anywhere')
          } else if (source === 'lever') {
            const cats = job.categories || {}
            const loc = cats.location?.toLowerCase() || ''
            const commitment = cats.commitment?.toLowerCase() || ''
            return loc.includes('remote') || commitment.includes('remote')
          } else {
            // Workable uses telecommuting: true at job level
            const isRemote = job.telecommuting === true
            const titleLower = job.title?.toLowerCase() || ''
            return isRemote || titleLower.includes('remote')
          }
        })

        log('info', `Remote jobs filtered: ${remoteJobs.length}/${jobs.length}`)

        // Process jobs
        for (const job of remoteJobs) {
          let sourceUrl: string | undefined
          switch (source) {
            case 'greenhouse':
              sourceUrl = job.absolute_url
              break
            case 'lever':
              sourceUrl = job.hostedUrl
              break
            case 'workable':
              sourceUrl = job.url || job.application_url || `https://apply.workable.com/${company}/j/${job.shortcode}/`
              break
          }

          if (!sourceUrl) continue

          // Check if exists
          const existing = await db.select()
            .from(schema.jobs)
            .where(eq(schema.jobs.sourceUrl, sourceUrl))
            .limit(1)

          let title: string
          let description: string

          switch (source) {
            case 'greenhouse':
              title = job.title
              description = job.content || ''
              break
            case 'lever':
              title = job.text
              description = job.descriptionPlain || job.description || ''
              break
            case 'workable':
              title = job.title
              description = '' // Workable widget API doesn't include description
              break
          }

          // Extract post date from API response
          let postDate: Date | null = null
          if (source === 'greenhouse' && job.updated_at) {
            // Greenhouse uses ISO-8601 format
            postDate = new Date(job.updated_at)
          } else if (source === 'lever' && job.createdAt) {
            // Lever uses Unix timestamp in milliseconds
            postDate = new Date(job.createdAt)
          } else if (source === 'workable' && job.created_at) {
            // Workable uses ISO-8601 format
            postDate = new Date(job.created_at)
          }

          const categoryId = determineCategoryId(title, description, [])

          if (existing.length > 0) {
            await db.update(schema.jobs).set({
              title,
              company,
              descriptionRaw: description,
              isCleansed: 0,
              updatedAt: new Date(),
              postDate: postDate || existing[0].postDate,  // Keep existing if no new date
              categoryId
            }).where(eq(schema.jobs.id, existing[0].id))
            jobsUpdated++
          } else {
            await db.insert(schema.jobs).values({
              title,
              company,
              descriptionRaw: description,
              isCleansed: 0,
              sourceUrl,
              sourceName: source === 'greenhouse' ? 'Greenhouse' : source === 'lever' ? 'Lever' : 'Workable',
              postDate: postDate || new Date(),  // Use current date as fallback
              categoryId,
              remoteType: 'fully_remote'
            })
            jobsAdded++
          }
        }

        log('success', `${company}: ${jobsAdded} added, ${jobsUpdated} updated`)
      }
    }

    // Update sync history success
    await db.update(schema.syncHistory).set({
      status: 'completed',
      completedAt: new Date(),
      logs: logs.slice(0, 30),
      stats: {
        jobsAdded,
        jobsUpdated,
        jobsDeleted: 0,
        company,
        companyIndex: atsIndex,
        totalCompanies: companies.length,
        durationMs: Date.now() - startTime
      } as any
    }).where(eq(schema.syncHistory.id, syncId))

    // Update batch state (clear cooldown on successful Workable sync)
    await updateAtsBatchState(db, source, nextIndex, source === 'workable' ? null : undefined)

    return {
      success: true,
      source,
      company,
      jobsAdded,
      jobsUpdated,
      duration: Date.now() - startTime
    }

  } catch (error: any) {
    // Handle rate limits gracefully
    if (error.message.includes('429') || (error.cause && String(error.cause).includes('429'))) {
      const errorMsg = 'Rate limit hit (429)'
      log('warning', `${errorMsg} for ${source}. Skipping and rotating.`)

      // Set cooldown for Workable (120s default since we don't have response headers here)
      if (source === 'workable') {
        const cooldownUntil = new Date(Date.now() + 120000).toISOString()
        await updateAtsBatchState(db, source, atsIndex, cooldownUntil) // Don't advance index
      } else {
        await updateAtsBatchState(db, source, nextIndex)
      }

      // Mark as failed in DB so it doesn't stay "running"
      await markSyncFailed(db, syncId, errorMsg, logs)

      return {
        success: false,
        source,
        company,
        jobsAdded: 0,
        jobsUpdated: 0,
        error: errorMsg,
        duration: Date.now() - startTime
      }
    }

    await markSyncFailed(db, syncId, error, logs)
    throw error
  }
}

async function updateAtsBatchState(
  db: DrizzleD1Database,
  source: string,
  nextIndex: number,
  workableCooldownUntil?: string | null
) {
  const existing = await db.select()
    .from(schema.syncHistory)
    .where(sql`status = 'batch_state' AND sync_type = 'ats'`)
    .limit(1)

  // Preserve existing cooldown if not explicitly changing it
  let cooldown = workableCooldownUntil
  if (cooldown === undefined && existing.length > 0 && existing[0].stats) {
    const existingState = existing[0].stats as any
    cooldown = existingState.workableCooldownUntil
  }

  const state = {
    atsIndex: nextIndex,
    lastSource: source,
    lastUpdated: new Date().toISOString(),
    workableCooldownUntil: cooldown || null
  }

  if (existing.length > 0) {
    await db.update(schema.syncHistory).set({
      stats: state as any,
      completedAt: new Date()
    }).where(sql`id = ${existing[0].id}`)
  } else {
    await db.insert(schema.syncHistory).values({
      id: crypto.randomUUID(),
      syncType: 'ats',
      status: 'batch_state',
      startedAt: new Date(),
      completedAt: new Date(),
      stats: state as any
    })
  }
}

// ============================================
// Aggregator Sync Logic (RemoteOK/Himalayas/Jobicy)
// ============================================

// Aggregator sources rotation order
const AGGREGATOR_SOURCES = ['remoteok', 'himalayas', 'jobicy'] as const
type AggregatorSource = typeof AGGREGATOR_SOURCES[number]

// Source-specific batch limits (API-constrained)
const BATCH_LIMITS = {
  remoteok: 50,    // No documented limit, process reasonable batch
  himalayas: 20,   // Max 20 per request as of March 2025 API change
  jobicy: 100      // Jobicy allows up to 100 per request (API default/max)
} as const
const OFFSET_RESET_HOURS = 24

// Jobicy industry categories for rotation (like RemoteOK tags)
// Each industry returns up to 100 jobs, giving us ~1200 unique jobs across all industries
// Values from Jobicy API docs: https://jobicy.com/api/v2
const JOBICY_INDUSTRIES = [
  'dev',              // Development
  'marketing',        // Marketing
  'design-multimedia', // Design & Multimedia
  'business',         // Business
  'engineering',      // Engineering
  'hr',               // Human Resources
  'copywriting',      // Writing/Copywriting
  'data-science',     // Data Science
  'accounting-finance', // Finance/Accounting
  'management',       // Management/Product
  'technical-support', // Technical Support
  'seo'               // SEO
] as const

function getNextAggregatorSource(lastSource: AggregatorSource): AggregatorSource {
  const currentIndex = AGGREGATOR_SOURCES.indexOf(lastSource)
  const nextIndex = (currentIndex + 1) % AGGREGATOR_SOURCES.length
  return AGGREGATOR_SOURCES[nextIndex]
}

export async function syncAggregator(
  db: DrizzleD1Database,
  timeStr: string,
  forcedSource?: AggregatorSource  // NEW: Allow forcing specific source for dedicated workers
): Promise<SyncResult> {
  const syncId = crypto.randomUUID()
  const startTime = Date.now()
  const logs: LogEntry[] = []

  const log = (type: LogEntry['type'], message: string) => {
    logs.push(createLog(type, message))
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`[${timeStr}] ${emoji} ${message}`)
  }

  try {
    // Get batch state
    let batchState = await db.select()
      .from(schema.syncHistory)
      .where(sql`status = 'batch_state' AND sync_type = 'aggregator'`)
      .limit(1)

    let lastSource: AggregatorSource = 'jobicy' // Start with jobicy so first run goes to remoteok
    let remoteokTagIndex = 0
    let jobicyIndustryIndex = 0

    if (batchState.length > 0 && batchState[0].stats) {
      const state = batchState[0].stats as any
      lastSource = state.lastSource || 'jobicy'
      remoteokTagIndex = state.remoteokTagIndex || 0
      jobicyIndustryIndex = state.jobicyIndustryIndex || 0
    }

    // Use forced source if provided (for dedicated workers), otherwise rotate
    // 3-way rotation: remoteok -> himalayas -> jobicy -> remoteok...
    const source = forcedSource || getNextAggregatorSource(lastSource)

    // Get offset state for this source
    let currentOffset = 0
    let offsetResetTime: string | null = null
    if (batchState.length > 0 && batchState[0].stats) {
      const state = batchState[0].stats as any
      const offsets = state.offsets || {}
      currentOffset = offsets[source]?.offset || 0
      offsetResetTime = offsets[source]?.resetTime || null

      // Check if we need to reset offset (24 hours elapsed)
      if (offsetResetTime) {
        const resetDate = new Date(offsetResetTime)
        const hoursSinceReset = (Date.now() - resetDate.getTime()) / (1000 * 60 * 60)
        if (hoursSinceReset >= OFFSET_RESET_HOURS) {
          currentOffset = 0
          console.log(`[${timeStr}] 🔄 Resetting ${source} offset (24h elapsed)`)
        }
      }
    }
    const sourceNameMap: Record<AggregatorSource, string> = {
      remoteok: 'RemoteOK',
      himalayas: 'Himalayas',
      jobicy: 'Jobicy'
    }
    const sourceName = sourceNameMap[source]

    let currentTag = ''
    let apiUrl = ''

    if (source === 'remoteok') {
      // RemoteOK uses tag rotation instead of offset pagination
      currentTag = REMOTEOK_TAGS[remoteokTagIndex % REMOTEOK_TAGS.length]
      apiUrl = `https://remoteok.com/api?tag=${currentTag}`
      log('info', `Syncing ${sourceName} tag: ${currentTag} (index ${remoteokTagIndex}/${REMOTEOK_TAGS.length})`)
    } else if (source === 'himalayas') {
      // Himalayas supports offset pagination (max 20 per request as of March 2025)
      apiUrl = `https://himalayas.app/jobs/api?limit=${BATCH_LIMITS.himalayas}&offset=${currentOffset}`
      log('info', `Starting ${sourceName} sync (offset: ${currentOffset}, limit: ${BATCH_LIMITS.himalayas})`)
    } else {
      // Jobicy - uses industry rotation (like RemoteOK tags)
      // Each industry can return up to 50 jobs, giving us ~600 unique jobs total
      const industry = JOBICY_INDUSTRIES[jobicyIndustryIndex % JOBICY_INDUSTRIES.length]
      currentTag = industry
      apiUrl = `https://jobicy.com/api/v2/remote-jobs?count=${BATCH_LIMITS.jobicy}&industry=${industry}`
      log('info', `Syncing ${sourceName} industry: ${industry} (index ${jobicyIndustryIndex}/${JOBICY_INDUSTRIES.length})`)
    }

    log('info', `API: ${apiUrl}`)

    // Create sync history record
    await db.insert(schema.syncHistory).values({
      id: syncId,
      syncType: 'job_sync',
      source: source,
      status: 'running',
      startedAt: new Date(),
      logs: [createLog('info', `Syncing ${sourceName}${currentTag ? ` (${currentTag})` : ''}`)],
      stats: {
        jobsAdded: 0,
        jobsUpdated: 0,
        jobsDeleted: 0,
        tag: currentTag || null,
        tagIndex: source === 'remoteok' ? remoteokTagIndex : null,
        totalTags: source === 'remoteok' ? REMOTEOK_TAGS.length : null
      } as any
    })

    let jobsAdded = 0
    let jobsUpdated = 0

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'SpearyxJobBot/1.0 (https://jobs.spearyx.com)'
      }
    })

    log('info', `HTTP ${response.status} ${response.statusText}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Check content-type
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error(`Invalid response type: ${contentType.substring(0, 50)} (expected JSON)`)
    }

    const data = await response.json() as any

    // Parse jobs based on source
    let jobs: any[] = []
    if (source === 'remoteok') {
      jobs = Array.isArray(data) ? data.filter((j: any) => j.id && j.position) : []
    } else if (source === 'himalayas') {
      jobs = data.jobs || []
    } else {
      // Jobicy
      jobs = data.jobs || []
    }

    log('info', `Total jobs from API: ${jobs.length}`)

    // Determine which jobs to process and check pagination status
    let jobsToProcess: any[]
    let paginationExhausted = false

    if (source === 'jobicy') {
      // Jobicy uses industry rotation - process first batch from each industry
      // Industry rotation happens automatically via jobicyIndustryIndex
      jobsToProcess = jobs.slice(0, BATCH_LIMITS.jobicy)
      // For Jobicy, pagination is "exhausted" after processing each industry
      // The industry rotation happens in batch state update
      paginationExhausted = true  // Always advance to next industry
      log('info', `Processing ${jobsToProcess.length} jobs from industry`)
    } else if (source === 'remoteok') {
      // RemoteOK uses tag rotation
      jobsToProcess = jobs.slice(0, BATCH_LIMITS.remoteok)
      paginationExhausted = true  // Always advance to next tag
      log('info', `Processing ${jobsToProcess.length} jobs from tag`)
    } else {
      // Himalayas uses offset pagination
      // Only consider exhausted when API returns 0 jobs (their API caps at 20 per request)
      // The 24hr timer will also reset offset regardless
      paginationExhausted = jobs.length === 0
      if (paginationExhausted) {
        log('info', `Pagination exhausted for ${sourceName} (no more jobs at offset ${currentOffset})`)
      }
      jobsToProcess = jobs.slice(0, BATCH_LIMITS.himalayas)
    }

    log('info', `Processing ${jobsToProcess.length} jobs`)

    // Batch Process jobs
    if (jobsToProcess.length > 0) {
      // 1. Prepare all jobs
      const jobsWithMetadata = jobsToProcess.map(job => {
        let sourceUrl: string | null = null
        let title: string = ''
        let company: string = ''
        let description: string = ''
        let postDate: Date | null = null
        let salary: string | null = null

        if (source === 'remoteok') {
          sourceUrl = `https://remoteok.com/l/${job.id}`
          title = job.position
          company = job.company
          description = job.description || ''
          if (job.date) {
            const d = new Date(job.date)
            if (!isNaN(d.getTime())) postDate = d
          }
        } else if (source === 'himalayas') {
          sourceUrl = job.applicationLink || job.url
          title = job.title
          company = job.companyName
          description = job.description || ''
          if (job.pubDate) {
            const d = new Date(job.pubDate * 1000)
            if (!isNaN(d.getTime())) postDate = d
          }
          if (job.minSalary && job.maxSalary && job.currency) {
            salary = `${job.currency} ${job.minSalary.toLocaleString()} - ${job.maxSalary.toLocaleString()}`
          }
        } else {
          // Jobicy - decode HTML entities in title and company (API returns encoded strings)
          sourceUrl = job.url
          title = decodeHtmlEntities(job.jobTitle || '')
          company = decodeHtmlEntities(job.companyName || '')
          description = job.jobDescription || job.jobExcerpt || ''
          if (job.pubDate) {
            const d = new Date(job.pubDate)
            if (!isNaN(d.getTime())) postDate = d
          }
          if (job.annualSalaryMin && job.annualSalaryMax && job.salaryCurrency) {
            salary = `${job.salaryCurrency} ${job.annualSalaryMin.toLocaleString()} - ${job.annualSalaryMax.toLocaleString()}/year`
          }
        }

        if (!sourceUrl) return null

        const categoryId = determineCategoryId(title, description, job.tags || [])

        return {
          title,
          company,
          descriptionRaw: description,
          isCleansed: 0,
          sourceUrl,
          sourceName,
          payRange: salary,
          postDate: postDate || new Date(),
          categoryId,
          remoteType: 'fully_remote',
          updatedAt: new Date() // For updates
        }
      }).filter(Boolean) as any[]

      if (jobsWithMetadata.length > 0) {
        // 2. Check existing jobs in one query
        const sourceUrls = jobsWithMetadata.map(j => j.sourceUrl)
        const existingJobs = await db.select({
          sourceUrl: schema.jobs.sourceUrl
        })
          .from(schema.jobs)
          .where(inArray(schema.jobs.sourceUrl, sourceUrls))

        const existingUrls = new Set(existingJobs.map(j => j.sourceUrl))

        // Calculate stats
        jobsAdded = jobsWithMetadata.filter(j => !existingUrls.has(j.sourceUrl)).length
        jobsUpdated = jobsWithMetadata.filter(j => existingUrls.has(j.sourceUrl)).length

        // 3. Perform batch upsert using D1's native batching
        try {
          // Drizzle's multi-row insert().values([...]) has issues with auto-increment IDs in D1
          // We use db.batch() with individual upserts instead, which is more reliable for D1
          const batchOps = jobsWithMetadata.map(job =>
            db.insert(schema.jobs).values(job).onConflictDoUpdate({
              target: schema.jobs.sourceUrl,
              set: {
                title: job.title,
                company: job.company,
                descriptionRaw: job.descriptionRaw,
                updatedAt: new Date(),
                categoryId: job.categoryId,
                payRange: job.payRange
              }
            })
          )

          if (batchOps.length > 0) {
            await db.batch(batchOps as any)
          }
        } catch (batchError: any) {
          log('warning', `D1 batch failed: ${batchError.message.substring(0, 50)}... falling back to sequential`)
          // Fallback to individual sequential processing if batch fails
          for (const job of jobsWithMetadata) {
            try {
              await db.insert(schema.jobs).values(job).onConflictDoUpdate({
                target: schema.jobs.sourceUrl,
                set: {
                  title: job.title,
                  company: job.company,
                  descriptionRaw: job.descriptionRaw,
                  updatedAt: new Date(),
                  categoryId: job.categoryId,
                  payRange: job.payRange
                }
              })
            } catch (e: any) {
              log('error', `Individual insert failed for ${job.title}: ${e.message}`)
            }
          }
        }
      }
    }

    log('success', `${jobsAdded} added, ${jobsUpdated} updated`)

    // Update sync history success
    await db.update(schema.syncHistory).set({
      status: 'completed',
      completedAt: new Date(),
      logs: logs.slice(0, 100),
      stats: { jobsAdded, jobsUpdated, jobsDeleted: 0 } as any
    }).where(eq(schema.syncHistory.id, syncId))

    // Update batch state with new offset
    const nextOffset = paginationExhausted ? 0 : currentOffset + jobsToProcess.length
    const shouldResetOffset = paginationExhausted || (currentOffset === 0 && !offsetResetTime)

    await updateAggregatorBatchState(db, source, remoteokTagIndex, jobicyIndustryIndex, {
      offset: nextOffset,
      resetTime: shouldResetOffset ? new Date().toISOString() : offsetResetTime
    })

    return {
      success: true,
      source,
      tag: currentTag || undefined,
      jobsAdded,
      jobsUpdated,
      duration: Date.now() - startTime
    }

  } catch (error) {
    await markSyncFailed(db, syncId, error, logs)
    throw error
  }
}

async function updateAggregatorBatchState(
  db: DrizzleD1Database,
  source: string,
  remoteokTagIndex: number,
  jobicyIndustryIndex: number,
  offsetInfo?: { offset: number; resetTime: string | null }
) {
  const existing = await db.select()
    .from(schema.syncHistory)
    .where(sql`status = 'batch_state' AND sync_type = 'aggregator'`)
    .limit(1)

  // Increment tag index if this was a RemoteOK sync
  const nextRemoteokTagIndex = source === 'remoteok'
    ? (remoteokTagIndex + 1) % REMOTEOK_TAGS.length
    : (existing[0]?.stats as any)?.remoteokTagIndex || 0

  // Increment industry index if this was a Jobicy sync
  const nextJobicyIndustryIndex = source === 'jobicy'
    ? (jobicyIndustryIndex + 1) % JOBICY_INDUSTRIES.length
    : (existing[0]?.stats as any)?.jobicyIndustryIndex || 0

  // Preserve existing offsets and update the current source's offset
  const existingOffsets = (existing[0]?.stats as any)?.offsets || {}
  const updatedOffsets = {
    ...existingOffsets,
    [source]: offsetInfo || existingOffsets[source] || { offset: 0, resetTime: null }
  }

  const state = {
    lastSource: source,
    remoteokTagIndex: nextRemoteokTagIndex,
    jobicyIndustryIndex: nextJobicyIndustryIndex,
    offsets: updatedOffsets,
    lastUpdated: new Date().toISOString()
  }

  if (existing.length > 0) {
    await db.update(schema.syncHistory).set({
      stats: state as any,
      completedAt: new Date()
    }).where(sql`id = ${existing[0].id}`)
  } else {
    await db.insert(schema.syncHistory).values({
      id: crypto.randomUUID(),
      syncType: 'aggregator',
      status: 'batch_state',
      startedAt: new Date(),
      completedAt: new Date(),
      stats: state as any
    })
  }
}


// ============================================
// Discovery Sync Logic
// ============================================

export async function syncDiscovery(
  db: DrizzleD1Database,
  timeStr: string
): Promise<{ success: boolean; companiesChecked: number; companiesAdded: number; companiesUpdated: number; duration: number; error?: string }> {
  const syncId = crypto.randomUUID()
  const startTime = Date.now()
  const logs: LogEntry[] = []

  const log = (type: LogEntry['type'], message: string) => {
    logs.push(createLog(type, message))
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`[${timeStr}] ${emoji} ${message}`)
  }

  try {
    log('info', 'Starting company discovery')

    // Create sync history record
    await db.insert(schema.syncHistory).values({
      id: syncId,
      syncType: 'discovery',
      source: null,
      status: 'running',
      startedAt: new Date(),
      logs: [createLog('info', 'Starting discovery')],
      stats: { companiesAdded: 0, companiesChecked: 0 } as any
    })

    // Get pending potential companies
    const potentialCompanies = await db.select()
      .from(schema.potentialCompanies)
      .where(sql`status = 'pending' OR status IS NULL`)
      .limit(5)

    let companiesChecked = 0
    let companiesAdded = 0
    let companiesUpdated = 0
    const discovered: string[] = []

    // Generate slug variations
    const generateSlugVariations = (slug: string): string[] => {
      const variations = new Set<string>()
      variations.add(slug.toLowerCase())

      if (slug.includes('-')) {
        variations.add(slug.replace(/-/g, '_').toLowerCase())
        variations.add(slug.replace(/-/g, '').toLowerCase())
        const camel = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
        variations.add(camel)
        variations.add(camel.toLowerCase())
      }

      if (slug.includes('_')) {
        variations.add(slug.replace(/_/g, '-').toLowerCase())
        variations.add(slug.replace(/_/g, '').toLowerCase())
        const camel = slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
        variations.add(camel)
        variations.add(camel.toLowerCase())
      }

      if (!slug.includes('-') && !slug.includes('_') && /[A-Z]/.test(slug)) {
        const words = slug.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
        variations.add(words)
        variations.add(words.replace(/-/g, '_'))
        variations.add(words.replace(/-/g, ''))
      }

      return Array.from(variations)
    }

    for (const potential of potentialCompanies) {
      companiesChecked++
      const baseSlug = potential.slug
      const slugVariations = generateSlugVariations(baseSlug)
      let foundOnAnySource = false

      try {
        slugLoop: for (const slug of slugVariations) {
          if (foundOnAnySource) break

          // Try Greenhouse
          const ghUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
          const ghResponse = await fetch(ghUrl)

          if (ghResponse.ok) {
            const data = await ghResponse.json() as any
            const jobs = data.jobs || []
            const remoteJobs = jobs.filter((j: any) => {
              const loc = j.location?.name?.toLowerCase() || ''
              return loc.includes('remote') || loc.includes('anywhere')
            })

            // Check if exists
            const existing = await db.select().from(schema.discoveredCompanies).where(eq(schema.discoveredCompanies.slug, slug)).limit(1)
            const isNew = existing.length === 0

            await db.insert(schema.discoveredCompanies).values({
              slug,
              name: baseSlug,
              source: 'Greenhouse',
              jobCount: jobs.length,
              remoteJobCount: remoteJobs.length
            }).onConflictDoUpdate({
              target: schema.discoveredCompanies.slug,
              set: {
                source: 'Greenhouse',
                jobCount: jobs.length,
                remoteJobCount: remoteJobs.length,
                updatedAt: new Date()
              }
            })

            if (isNew) {
              companiesAdded++
              log('success', `✓ Discovered ${baseSlug} as ${slug} (Greenhouse, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            } else {
              companiesUpdated++
              log('success', `↻ Updated ${baseSlug} as ${slug} (Greenhouse, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            }

            discovered.push(baseSlug)
            foundOnAnySource = true
            break slugLoop
          } else {
            log('info', `${slug}: Greenhouse HTTP ${ghResponse.status}`)
          }

          // Try Lever
          const lvUrl = `https://api.lever.co/v0/postings/${slug}`
          const lvResponse = await fetch(lvUrl)

          if (lvResponse.ok) {
            const jobs = await lvResponse.json() as any[]
            const remoteJobs = jobs.filter((j: any) => {
              const loc = j.categories?.location?.toLowerCase() || ''
              return loc.includes('remote')
            })

            // Check if exists
            const existing = await db.select().from(schema.discoveredCompanies).where(eq(schema.discoveredCompanies.slug, slug)).limit(1)
            const isNew = existing.length === 0

            await db.insert(schema.discoveredCompanies).values({
              slug,
              name: baseSlug,
              source: 'Lever',
              jobCount: jobs.length,
              remoteJobCount: remoteJobs.length
            }).onConflictDoUpdate({
              target: schema.discoveredCompanies.slug,
              set: {
                source: 'Lever',
                jobCount: jobs.length,
                remoteJobCount: remoteJobs.length,
                updatedAt: new Date()
              }
            })

            if (isNew) {
              companiesAdded++
              log('success', `✓ Discovered ${baseSlug} as ${slug} (Lever, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            } else {
              companiesUpdated++
              log('success', `↻ Updated ${baseSlug} as ${slug} (Lever, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            }

            discovered.push(baseSlug)
            foundOnAnySource = true
            break slugLoop
          } else {
            log('info', `${slug}: Lever HTTP ${lvResponse.status}`)
          }

          // Try Workable
          const wkUrl = `https://apply.workable.com/api/v1/widget/accounts/${slug}`
          const wkResponse = await fetch(wkUrl)

          if (wkResponse.ok) {
            const data = await wkResponse.json() as any
            const jobs = data.jobs || []
            const remoteJobs = jobs.filter((j: any) => {
              const isRemote = j.telecommuting === true
              const titleLower = j.title?.toLowerCase() || ''
              return isRemote || titleLower.includes('remote')
            })

            // Check if exists
            const existing = await db.select().from(schema.discoveredCompanies).where(eq(schema.discoveredCompanies.slug, slug)).limit(1)
            const isNew = existing.length === 0

            await db.insert(schema.discoveredCompanies).values({
              slug,
              name: data.name || baseSlug,
              source: 'Workable',
              jobCount: jobs.length,
              remoteJobCount: remoteJobs.length
            }).onConflictDoUpdate({
              target: schema.discoveredCompanies.slug,
              set: {
                source: 'Workable',
                jobCount: jobs.length,
                remoteJobCount: remoteJobs.length,
                updatedAt: new Date()
              }
            })

            if (isNew) {
              companiesAdded++
              log('success', `✓ Discovered ${baseSlug} as ${slug} (Workable, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            } else {
              companiesUpdated++
              log('success', `↻ Updated ${baseSlug} as ${slug} (Workable, ${jobs.length} jobs, ${remoteJobs.length} remote)`)
            }

            discovered.push(baseSlug)
            foundOnAnySource = true
            break slugLoop
          } else {
            log('info', `${slug}: Workable HTTP ${wkResponse.status}`)
          }

          // Rate limit protection for Workable discovery
          await sleep(1000)
        }

        // Mark as checked
        await db.update(schema.potentialCompanies).set({
          status: foundOnAnySource ? 'discovered' : 'not_found',
          lastCheckedAt: new Date(),
          checkCount: (potential.checkCount || 0) + 1
        }).where(eq(schema.potentialCompanies.id, potential.id))

        if (!foundOnAnySource) {
          // Only log not found if none of the variations worked
          // log('info', `${baseSlug}: Not found on any ATS`) 
        }

      } catch (checkError) {
        log('warning', `Error checking ${baseSlug}: ${checkError}`)
      }
    }

    log('success', `Checked ${companiesChecked}, discovered ${companiesAdded}, updated ${companiesUpdated}`)

    // Update sync history
    await db.update(schema.syncHistory).set({
      status: 'completed',
      completedAt: new Date(),
      logs: logs.slice(0, 20),
      stats: { companiesAdded, companiesUpdated, companiesChecked } as any
    }).where(eq(schema.syncHistory.id, syncId))

    return {
      success: true,
      companiesChecked,
      companiesAdded,
      companiesUpdated,
      duration: Date.now() - startTime
    }

  } catch (error) {
    await markSyncFailed(db, syncId, error, logs)
    throw error
  }
}

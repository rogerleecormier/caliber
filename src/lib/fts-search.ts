/**
 * Full-Text Search utilities for jobs
 * Uses SQLite FTS5 virtual table for fast keyword matching
 */

import type { DrizzleD1Database } from '@/db/db'
import { sql } from 'drizzle-orm'

export interface FtsSearchOptions {
  query: string
  limit?: number
  offset?: number
}

export interface FtsSearchResult {
  jobId: number
  title: string | null
  company: string | null
  descriptionPruned: string | null
  rank: number
}

/**
 * Search jobs using FTS5 full-text search.
 * Returns job IDs with relevance ranking.
 *
 * @param db - Database instance
 * @param options - Search query and pagination options
 * @returns Array of matching jobs with relevance scores
 */
export async function searchJobsByKeyword(
  db: DrizzleD1Database,
  options: FtsSearchOptions,
): Promise<FtsSearchResult[]> {
  const { query, limit = 50, offset = 0 } = options

  // FTS5 query syntax: escape single quotes and build query
  const escapedQuery = query.replace(/'/g, "''")
  const ftsQuery = `'${escapedQuery}'`

  try {
    const results = await db
      .select({
        jobId: sql<number>`jobs_fts.job_id`,
        title: sql<string | null>`jobs_fts.title`,
        company: sql<string | null>`jobs_fts.company`,
        descriptionPruned: sql<string | null>`jobs_fts.description_pruned`,
        rank: sql<number>`rank`,
      })
      .from(sql`jobs_fts`)
      .where(sql`jobs_fts MATCH ${ftsQuery}`)
      .orderBy(sql`rank ASC`)
      .limit(limit)
      .offset(offset)

    return results as FtsSearchResult[]
  } catch (error) {
    console.error(`[fts-search] Error searching jobs with query "${query}":`, error)
    return []
  }
}

/**
 * Search jobs by keyword and return full job records.
 * Joins FTS5 results with the jobs table.
 *
 * @param db - Database instance
 * @param options - Search query and pagination options
 * @returns Array of matching jobs with full details
 */
export async function searchJobsWithDetails(
  db: DrizzleD1Database,
  options: FtsSearchOptions,
): Promise<Array<Record<string, unknown>>> {
  const { query, limit = 50, offset = 0 } = options

  const escapedQuery = query.replace(/'/g, "''")
  const ftsQuery = `'${escapedQuery}'`

  try {
    const results = await db.run(
      sql`
        SELECT j.*
        FROM jobs j
        INNER JOIN jobs_fts f ON j.id = f.job_id
        WHERE f MATCH ${ftsQuery}
        ORDER BY f.rank ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
    )

    return results as Array<Record<string, unknown>>
  } catch (error) {
    console.error(`[fts-search] Error searching jobs with details for query "${query}":`, error)
    return []
  }
}

/**
 * Get raw FTS5 search statistics (for debugging/monitoring).
 */
export async function getJobsCount(db: DrizzleD1Database): Promise<number> {
  try {
    const result = await db.run(sql`SELECT COUNT(*) as count FROM jobs_fts`)
    if (Array.isArray(result) && result[0]) {
      return (result[0] as Record<string, unknown>).count as number
    }
    return 0
  } catch (error) {
    console.error('[fts-search] Error getting jobs FTS count:', error)
    return 0
  }
}

import Fuse from 'fuse.js'
import type { Job, Category } from '../db/schema'

export interface JobWithCategory extends Job {
  id: number
  title: string
  company: string | null
  description: string | null
  descriptionRaw: string | null
  fullDescription: string | null
  isCleansed: number | null
  payRange: string | null
  postDate: Date | null
  sourceUrl: string
  sourceName: string
  categoryId: number
  remoteType: string
  createdAt: Date
  updatedAt: Date
  category: Category
}

export interface SearchOptions {
  query?: string
  categoryId?: number
  source?: string
  salaryRange?: string
  includeNoSalary?: boolean
  sortBy?: 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'recently-added'
  limit?: number
  offset?: number
}

export function searchJobs(jobs: JobWithCategory[], options: SearchOptions) {
  let results = [...jobs]

  // Filter by category if specified
  if (options.categoryId) {
    results = results.filter((job) => job.categoryId === options.categoryId)
  }

  // Filter by source if specified
  if (options.source) {
    results = results.filter((job) => job.sourceName === options.source)
  }

  // Filter by salary range if specified
  if (options.salaryRange) {
    results = results.filter((job) => {
      if (!job.payRange) {
        return !!options.includeNoSalary
      }

      // Parse salary range (e.g., "0-50000", "50000-100000", "200000+")
      const [filterMin, filterMax] = options.salaryRange!.includes('+')
        ? [parseInt(options.salaryRange!.replace('+', '')), Infinity]
        : options.salaryRange!.split('-').map(Number)

      // Extract numbers from pay range string, handling 'k' suffix
      // Matches: $100k, $100,000, 100k, 100000
      const matches = job.payRange.match(/(\d+(?:,\d{3})*|\d+)k?/gi)
      if (!matches || matches.length === 0) return false

      const salaries = matches.map(s => {
        const clean = s.toLowerCase().replace(/,/g, '').replace('$', '')
        if (clean.endsWith('k')) {
          return parseFloat(clean) * 1000
        }
        return parseFloat(clean)
      })

      // Get the minimum salary mentioned in the job's pay range
      // If only one number, treat it as both min and max
      const jobMinSalary = Math.min(...salaries)

      // Check if job's MINIMUM salary meets the filter's MINIMUM requirement
      // For ranges like "50k-100k", we want jobs that start at 50k or higher?
      // Or jobs that overlap?
      // User said: "filters for salary do not filter based upon minimum salary in the salary range"
      // This implies if I select "100k-150k", I expect jobs where the pay is at least 100k.

      // Logic: Job's minimum salary must be >= Filter's minimum salary
      // AND Job's minimum salary must be <= Filter's maximum salary (if not infinity)
      return jobMinSalary >= filterMin && (filterMax === Infinity || jobMinSalary <= filterMax)
    })
  }

  // Apply fuzzy search if query provided
  if (options.query && options.query.trim()) {
    const fuse = new Fuse(results, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'description', weight: 1 },
        { name: 'category.name', weight: 1.5 },
      ],
      threshold: 0.4,
      includeScore: true,
    })

    const searchResults = fuse.search(options.query)
    results = searchResults.map((result: any) => result.item)
  }

  // Apply sorting
  switch (options.sortBy) {
    case 'newest':
      results.sort((a: JobWithCategory, b: JobWithCategory) => {
        const dateA = a.postDate ? new Date(a.postDate).getTime() : 0
        const dateB = b.postDate ? new Date(b.postDate).getTime() : 0
        return dateB - dateA
      })
      break
    case 'oldest':
      results.sort((a: JobWithCategory, b: JobWithCategory) => {
        const dateA = a.postDate ? new Date(a.postDate).getTime() : 0
        const dateB = b.postDate ? new Date(b.postDate).getTime() : 0
        return dateA - dateB
      })
      break
    case 'title-asc':
      results.sort((a: JobWithCategory, b: JobWithCategory) => a.title.localeCompare(b.title))
      break
    case 'title-desc':
      results.sort((a: JobWithCategory, b: JobWithCategory) => b.title.localeCompare(a.title))
      break
    case 'recently-added':
      results.sort((a: JobWithCategory, b: JobWithCategory) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      break
    default:
      // Default to newest
      results.sort((a: JobWithCategory, b: JobWithCategory) => {
        const dateA = a.postDate ? new Date(a.postDate).getTime() : 0
        const dateB = b.postDate ? new Date(b.postDate).getTime() : 0
        return dateB - dateA
      })
  }

  // Apply pagination
  const total = results.length
  const limit = options.limit || 20
  const offset = options.offset || 0
  const paginatedResults = results.slice(offset, offset + limit)

  return {
    jobs: paginatedResults,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  }
}

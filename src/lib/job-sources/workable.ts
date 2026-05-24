import type { RawJobListing } from './types'
import { decodeHtmlEntities } from '../html-utils'
import companiesData from './workable-companies.json'
import { createThrottledRateLimitedFetcher } from '../pacer-utils'

// Type definition for the JSON structure
interface CompanyDatabase {
  version: string
  lastUpdated: string
  description: string
  categories: {
    [key: string]: {
      name: string
      companies: string[]
    }
  }
}

// Load and flatten company list from all categories
function getCompanyList(): string[] {
  const data = companiesData as CompanyDatabase
  const allCompanies: string[] = []
  
  // Extract companies from all categories
  Object.values(data.categories).forEach(category => {
    allCompanies.push(...category.companies)
  })
  
  // Remove duplicates
  return [...new Set(allCompanies)]
}

// Create throttled and rate-limited fetcher for Workable API
// Throttle: 1000ms between requests
// Rate limit: 120 requests per minute (2 per second)
const throttledFetch = createThrottledRateLimitedFetcher({
  throttle: {
    wait: 1000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  rateLimit: {
    maxRequests: 120,
    windowMs: 60000, // 1 minute
  },
})

/**
 * Workable Widget API Response Types
 * Based on actual API response from apply.workable.com
 */
interface WorkableJob {
  id?: string
  shortcode: string
  code?: string
  title: string
  department: string
  department_hierarchy?: { id: number; name: string }[]
  url: string
  application_url: string
  shortlink: string
  telecommuting: boolean  // Top-level field indicating remote work
  employment_type?: string
  country?: string
  city?: string
  state?: string
  experience?: string
  function?: string
  industry?: string
  published_on?: string
  created_at: string
  locations?: Array<{
    country: string
    countryCode: string
    city: string
    region: string | null
    hidden: boolean
  }>
}

interface WorkableResponse {
  name: string
  description: string | null
  jobs: WorkableJob[]
}

export async function* fetchWorkableJobs(
  _query?: string, 
  onLog?: (message: string) => void, 
  companyFilter?: string[], 
  jobOffset?: number, 
  limit?: number
): AsyncGenerator<RawJobListing[]> {
  let companies: string[] = []
  
  // Filter to specific companies if provided
  if (companyFilter && companyFilter.length > 0) {
    companies = companyFilter
  } else {
    companies = getCompanyList()
  }
  
  const log = (msg: string) => {
    console.log(msg)
    onLog?.(msg)
  }
  
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('🏢 Fetching jobs from Workable job boards')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`📊 Total companies to check: ${companies.length}`)
  log(`📅 Database last updated: ${(companiesData as CompanyDatabase).lastUpdated}`)
  if (jobOffset !== undefined && jobOffset > 0) {
    log(`🔢 Starting from job offset: ${jobOffset}`)
  }
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  let successCount = 0
  let failCount = 0
  let noJobsCount = 0
  let remoteJobsFound = 0
  
  for (const company of companies) {
    onLog?.(`Checking ${company}...`)
    
    try {
      // Workable Widget API endpoint
      const url = `https://apply.workable.com/api/v1/widget/accounts/${company}`
      const response = await throttledFetch(url)
      
      if (!response.ok) {
        if (response.status === 404) {
          // Company not found on Workable
          failCount++
        } else {
          log(`  ⚠️  ${company}: API returned ${response.status}`)
          failCount++
        }
        continue
      }
      
      const data: WorkableResponse = await response.json()
      
      if (!data.jobs || !Array.isArray(data.jobs)) {
        noJobsCount++
        continue
      }
      
      // Filter for remote positions
      // Workable uses telecommuting: true at job level for remote jobs
      // Also check title for "remote" keyword
      let remoteJobs = data.jobs
        .filter((job: WorkableJob) => {
          const isRemote = job.telecommuting === true
          const titleLower = job.title?.toLowerCase() || ''
          return isRemote || titleLower.includes('remote')
        })
      
      // Apply offset if provided
      if (jobOffset !== undefined && jobOffset > 0) {
        remoteJobs = remoteJobs.slice(jobOffset)
      }
      
      // Apply limit if provided
      if (limit !== undefined && limit > 0) {
        remoteJobs = remoteJobs.slice(0, limit)
      }
      
      const mappedJobs: RawJobListing[] = remoteJobs.map((job: WorkableJob) => {
        const cleanTitle = decodeHtmlEntities(job.title || '')
        
        // Capitalize company name for display
        const companyName = company.charAt(0).toUpperCase() + company.slice(1).replace(/-/g, ' ')
        
        // Extract department as tags
        const tags: string[] = []
        if (job.department) {
          tags.push(job.department)
        }
        if (job.department_hierarchy && Array.isArray(job.department_hierarchy)) {
          job.department_hierarchy.forEach(dept => {
            if (dept.name && !tags.includes(dept.name)) {
              tags.push(dept.name)
            }
          })
        }
        
        // Build location string from city/country or first location entry
        let location = 'Remote'
        if (job.city && job.country) {
          location = `${job.city}, ${job.country}`
        } else if (job.country) {
          location = job.country
        } else if (job.locations && job.locations.length > 0) {
          const loc = job.locations[0]
          if (loc.city && loc.country) {
            location = `${loc.city}, ${loc.country}`
          } else if (loc.country) {
            location = loc.country
          }
        }
        if (job.telecommuting) {
          location = location === 'Remote' ? 'Remote' : `${location} (Remote)`
        }
        
        return {
          externalId: `workable-${job.shortcode || job.id}`,
          title: cleanTitle,
          company: companyName,
          description: '', // Widget API doesn't include description
          location: location,
          salary: undefined, // Widget API doesn't include salary
          postedDate: new Date(job.created_at),
          sourceUrl: job.url || job.application_url || `https://apply.workable.com/${company}/j/${job.shortcode}/`,
          sourceName: 'Workable',
          tags
        }
      })
      
      if (mappedJobs.length > 0) {
        remoteJobsFound += mappedJobs.length
        log(`  ✅ ${company}: Found ${mappedJobs.length} remote job(s)`)
        yield mappedJobs
        successCount++
      } else {
        noJobsCount++
      }
      
    } catch (error) {
      log(`  ❌ ${company}: Error - ${error instanceof Error ? error.message : error}`)
      failCount++
    }
  }
  
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('📈 Workable Sync Summary')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`🎯 Total remote jobs found: ${remoteJobsFound}`)
  log(`✅ Companies with remote jobs: ${successCount}`)
  log(`➖ Companies with no remote jobs: ${noJobsCount}`)
  log(`❌ Failed/Not found: ${failCount}`)
  log(`📊 Success rate: ${((successCount / companies.length) * 100).toFixed(1)}%`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

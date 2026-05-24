import type { RawJobListing } from './types'
import { decodeHtmlEntities } from '../html-utils'
import companiesData from './greenhouse-companies.json'
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
  notes: {
    usage: string
    maintenance: string
    discovery: string
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
  
  // Remove duplicates (in case a company appears in multiple categories)
  return [...new Set(allCompanies)]
}

// Create throttled and rate-limited fetcher for Greenhouse API
// Throttle: 500ms between requests
// Rate limit: 120 requests per minute (2 per second)
const throttledFetch = createThrottledRateLimitedFetcher({
  throttle: {
    wait: 1000, // Increased to 1000ms for stability
    trailing: true,
    maxRetries: 3,
    retryDelay: 1000,
  },
  rateLimit: {
    maxRequests: 120,
    windowMs: 60000, // 1 minute
    sliding: true,
  },
})

export async function* fetchGreenhouseJobs(_query?: string, onLog?: (message: string) => void, companyFilter?: string[], jobOffset?: number, limit?: number): AsyncGenerator<RawJobListing[]> {
  // const allJobs: RawJobListing[] = [] // No longer needed
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
  log('🏢 Fetching jobs from Greenhouse job boards')
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
    // Provide feedback that we are checking this company
    // This is crucial for the UI to show activity
    onLog?.(`Checking ${company}...`)
    
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`
      const response = await throttledFetch(url)
      
      if (!response.ok) {
        // Some companies may not have active job boards or may have moved
        if (response.status === 404) {
          // log(`  ℹ️  ${company}: No job board found (404)`) // Too verbose
          failCount++
        } else {
          log(`  ⚠️  ${company}: API returned ${response.status}`)
          failCount++
        }
        continue
      }
      
      const data: any = await response.json()
      
      if (!data.jobs || !Array.isArray(data.jobs)) {
        // log(`  ℹ️  ${company}: No jobs array in response`) // Too verbose
        noJobsCount++
        continue
      }
      
      // Filter for remote positions
      let remoteJobs = data.jobs
        .filter((job: any) => {
          // Check if location name includes 'remote' (case insensitive)
          const locationName = job.location?.name?.toLowerCase() || ''
          return locationName.includes('remote')
        })

      // Apply offset if provided
      if (jobOffset !== undefined && jobOffset > 0) {
        remoteJobs = remoteJobs.slice(jobOffset);
      }

      // Apply limit if provided (OPTIMIZATION: slice before mapping to save CPU)
      if (limit !== undefined && limit > 0) {
        remoteJobs = remoteJobs.slice(0, limit);
      }

      remoteJobs = remoteJobs.map((job: any) => {
          const cleanTitle = decodeHtmlEntities(job.title || '')
          
          // Get the company name with proper capitalization
          // Some Greenhouse boards use lowercase company identifiers
          const companyName = job.company_name || 
            company.charAt(0).toUpperCase() + company.slice(1)
          
          // Try to extract salary from metadata if available
          let salaryRange = null
          if (job.metadata && Array.isArray(job.metadata)) {
            const salaryField = job.metadata.find((meta: any) => 
              meta.name?.toLowerCase().includes('salary') || 
              meta.name?.toLowerCase().includes('compensation')
            )
            if (salaryField && salaryField.value) {
              salaryRange = salaryField.value
            }
          }
          
          return {
            externalId: `greenhouse-${job.id}`,
            title: cleanTitle,
            company: companyName,
            description: null, // No description stored during sync
            location: job.location?.name || 'Remote',
            salary: salaryRange,
            postedDate: new Date(job.updated_at),
            sourceUrl: job.absolute_url,
            sourceName: 'Greenhouse',
            tags: job.departments?.map((d: any) => d.name) || []
          }
        })
      
      if (remoteJobs.length > 0) {
        remoteJobsFound += remoteJobs.length
        log(`  ✅ ${company}: Found ${remoteJobs.length} remote job(s)`)
        yield remoteJobs
        successCount++
      } else {
        // log(`  ➖ ${company}: No remote positions`) // Too verbose for UI
        noJobsCount++
      }
      
      // Throttling and rate limiting are now handled by throttledFetch
      // No need for manual sleep() anymore
      
      
    } catch (error) {
      log(`  ❌ ${company}: Error - ${error instanceof Error ? error.message : error}`)
      failCount++
    }
  }
  
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('📈 Greenhouse Sync Summary')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`🎯 Total remote jobs found: ${remoteJobsFound}`)
  log(`✅ Companies with remote jobs: ${successCount}`)
  log(`➖ Companies with no remote jobs: ${noJobsCount}`)
  log(`❌ Failed/Not found: ${failCount}`)
  log(`📊 Success rate: ${((successCount / companies.length) * 100).toFixed(1)}%`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // return allJobs // No longer needed
}




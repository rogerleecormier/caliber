import type { RawJobListing } from './types'
import { decodeHtmlEntities } from '../html-utils'
import companiesData from './lever-companies.json'

import { createThrottledRateLimitedFetcher } from '../pacer-utils'
import { extractSalaryFromDescription } from './salary-utils'

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

// Create throttled and rate-limited fetcher for Lever API
// Throttle: 1000ms between requests
// Rate limit: 120 requests per minute (2 per second)
const throttledFetch = createThrottledRateLimitedFetcher({
  throttle: {
    wait: 1000,
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

export async function* fetchLeverJobs(_query?: string, onLog?: (message: string) => void, companyFilter?: string[], jobOffset?: number, limit?: number): AsyncGenerator<RawJobListing[]> {
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
  log('🏢 Fetching jobs from Lever job boards')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`📊 Total companies to check: ${companies.length}`)
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
      // Lever API endpoint: https://api.lever.co/v0/postings/{company}?mode=json
      const url = `https://api.lever.co/v0/postings/${company}?mode=json`
      const response = await throttledFetch(url)
      
      if (!response.ok) {
        if (response.status === 404) {
          // log(`  ℹ️  ${company}: No job board found (404)`)
          failCount++
        } else {
          log(`  ⚠️  ${company}: API returned ${response.status}`)
          failCount++
        }
        continue
      }
      
      const jobs: any = await response.json()
      
      if (!jobs || !Array.isArray(jobs)) {
        // log(`  ℹ️  ${company}: No jobs array in response`)
        noJobsCount++
        continue
      }
      
      // Filter for remote positions
      let remoteJobs = jobs
        .filter((job: any) => {
          // Check categories.location and categories.commitment
          const location = job.categories?.location?.toLowerCase() || ''
          const commitment = job.categories?.commitment?.toLowerCase() || ''
          const description = job.descriptionPlain?.toLowerCase() || ''
          
          return location.includes('remote') || 
                 commitment.includes('remote') ||
                 description.includes('remote')
        })
      
      // Apply offset if provided
      if (jobOffset !== undefined && jobOffset > 0) {
        remoteJobs = remoteJobs.slice(jobOffset);
      }
      
      // Apply limit if provided
      if (limit !== undefined && limit > 0) {
        remoteJobs = remoteJobs.slice(0, limit);
      }
      
      remoteJobs = remoteJobs.map((job: any) => {
          // Create 200-word summary for DB storage
          // OPTIMIZATION: Use simple regex to strip tags instead of heavy sanitizeHtml
          // We only need plain text for the summary, and full HTML is fetched on-demand
          const rawDescription = job.description || ''
          const textOnly = rawDescription
            .replace(/<[^>]*>/g, ' ') // Strip tags
            .replace(/&nbsp;/g, ' ')  // Replace nbsp
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim()
            
          const words = textOnly.split(' ')
          const cleanDescription = words.slice(0, 200).join(' ') + (words.length > 200 ? '...' : '')
            
          const cleanTitle = decodeHtmlEntities(job.text || '')
          
          // Try to extract salary
          let salaryRange = null
          
          // Lever sometimes has salaryRange field
          if (job.salaryRange) {
            const min = job.salaryRange.min
            const max = job.salaryRange.max
            const currency = job.salaryRange.currency || 'USD'
            if (min && max) {
              salaryRange = `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`
            }
          }
          
          // If no explicit range, try to parse from description
          if (!salaryRange) {
             // Combine descriptionPlain and additionalPlain to search for salary
             const descriptionPlain = job.descriptionPlain || '';
             const additionalPlain = job.additionalPlain || '';
             const fullText = `${descriptionPlain}\n${additionalPlain}`;
             
             salaryRange = extractSalaryFromDescription(fullText);
             
             // Fallback to HTML description if plain text didn't yield results
             if (!salaryRange && cleanDescription) {
                // Use the already computed textOnly for salary extraction
                salaryRange = extractSalaryFromDescription(textOnly);
             }
          }
          
          return {
            externalId: `lever-${job.id}`,
            title: cleanTitle,
            company: company.charAt(0).toUpperCase() + company.slice(1),
            description: cleanDescription,
            location: job.categories?.location || 'Remote',
            salary: salaryRange || undefined,
            postedDate: new Date(job.createdAt),
            sourceUrl: job.applyUrl || job.hostedUrl,
            sourceName: 'Lever',
            tags: [
              job.categories?.team,
              job.categories?.department,
              job.categories?.commitment
            ].filter(Boolean)
          }
        })
      
      if (remoteJobs.length > 0) {
        yield remoteJobs
        remoteJobsFound += remoteJobs.length
        log(`  ✅ ${company}: Found ${remoteJobs.length} remote job(s)`)
        successCount++
      } else {
        // log(`  ➖ ${company}: No remote positions`)
        noJobsCount++
      }
      
      // Throttling and rate limiting are now handled by throttledFetch
      
      
    } catch (error) {
      log(`  ❌ ${company}: Error - ${error instanceof Error ? error.message : error}`)
      failCount++
    }
  }
  
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('📈 Lever Sync Summary')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`🎯 Total remote jobs found: ${remoteJobsFound}`)
  log(`✅ Companies with remote jobs: ${successCount}`)
  log(`➖ Companies with no remote jobs: ${noJobsCount}`)
  log(`❌ Failed/Not found: ${failCount}`)
  log(`📊 Success rate: ${((successCount / companies.length) * 100).toFixed(1)}%`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}



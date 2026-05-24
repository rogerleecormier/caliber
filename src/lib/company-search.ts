export interface CompanySearchResult {
  found: boolean
  company?: {
    slug: string
    name: string
    jobCount: number
    remoteJobCount: number
  }
  jobs?: Array<{
    id: string
    title: string
    location: string
    departments: string[]
    url: string
  }>
  error?: string
}

/**
 * Search for a company on Greenhouse
 */
async function searchGreenhouseCompany(query: string): Promise<CompanySearchResult> {
  const slug = query.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, error: 'Company not found on Greenhouse' }
      }
      return { found: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json()

    if (!data.jobs || !Array.isArray(data.jobs)) {
      return { found: false, error: 'No jobs data in response' }
    }

    // Filter for remote positions
    const remoteJobs = data.jobs.filter((job: any) => {
      const locationName = job.location?.name?.toLowerCase() || ''
      return locationName.includes('remote')
    })

    return {
      found: true,
      company: {
        slug,
        name: data.jobs[0]?.company_name || slug,
        jobCount: data.jobs.length,
        remoteJobCount: remoteJobs.length
      },
      jobs: remoteJobs.slice(0, 10).map((job: any) => ({
        id: `greenhouse-${job.id}`,
        title: job.title,
        location: job.location?.name || 'Remote',
        departments: job.departments?.map((d: any) => d.name) || [],
        url: job.absolute_url
      }))
    }
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Search for a company on Lever
 */
async function searchLeverCompany(query: string): Promise<CompanySearchResult> {
  const slug = query.toLowerCase().trim().replace(/\s+/g, '')
  
  try {
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, error: 'Company not found on Lever' }
      }
      return { found: false, error: `HTTP ${response.status}` }
    }

    const jobs = await response.json()

    if (!Array.isArray(jobs)) {
      return { found: false, error: 'Invalid response format' }
    }

    // Filter for remote positions
    const remoteJobs = jobs.filter((job: any) => {
      const location = job.categories?.location?.toLowerCase() || ''
      const commitment = job.categories?.commitment?.toLowerCase() || ''
      return location.includes('remote') || commitment.includes('remote')
    })

    return {
      found: true,
      company: {
        slug,
        name: jobs[0]?.companyName || slug,
        jobCount: jobs.length,
        remoteJobCount: remoteJobs.length
      },
      jobs: remoteJobs.slice(0, 10).map((job: any) => ({
        id: `lever-${job.id}`,
        title: job.text,
        location: job.categories?.location || job.workplaceType || 'Remote',
        departments: job.categories?.team ? [job.categories.team] : [],
        url: job.hostedUrl
      }))
    }
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Search for a company on RemoteOK
 */
async function searchRemoteOKCompany(query: string): Promise<CompanySearchResult> {
  // RemoteOK doesn't have a company-specific API, so we'll search for jobs with the company name
  try {
    const url = `https://remoteok.com/api`
    const response = await fetch(url)

    if (!response.ok) {
      return { found: false, error: `HTTP ${response.status}` }
    }

    const jobs = await response.json()
    
    if (!Array.isArray(jobs)) {
      return { found: false, error: 'Invalid response format' }
    }

    // Filter jobs by company name (case-insensitive)
    const companyJobs = jobs.filter((job: any) => 
      job.company?.toLowerCase().includes(query.toLowerCase())
    )

    if (companyJobs.length === 0) {
      return { found: false, error: 'Company not found on RemoteOK' }
    }

    return {
      found: true,
      company: {
        slug: query.toLowerCase().replace(/\s+/g, '-'),
        name: companyJobs[0].company || query,
        jobCount: companyJobs.length,
        remoteJobCount: companyJobs.length
      },
      jobs: companyJobs.slice(0, 10).map((job: any) => ({
        id: `remoteok-${job.id}`,
        title: job.position,
        location: job.location || 'Remote',
        departments: job.tags || [],
        url: job.url
      }))
    }
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Search for a company on Himalayas
 */
async function searchHimalayasCompany(query: string): Promise<CompanySearchResult> {
  // Himalayas uses a similar structure to other job boards
  const slug = query.toLowerCase().trim().replace(/\s+/g, '-')
  
  try {
    const url = `https://himalayas.app/companies/${slug}/jobs`
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, error: 'Company not found on Himalayas' }
      }
      return { found: false, error: `HTTP ${response.status}` }
    }

    // Himalayas returns HTML, so we'll just check if the page exists
    // If it exists, we consider the company found
    return {
      found: true,
      company: {
        slug,
        name: query,
        jobCount: 0, // Can't determine from HTML
        remoteJobCount: 0
      },
      jobs: []
    }
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Search for a company on Workable
 */
async function searchWorkableCompany(query: string): Promise<CompanySearchResult> {
  const slug = query.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  
  try {
    const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, error: 'Company not found on Workable' }
      }
      return { found: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json() as any

    if (!data.jobs || !Array.isArray(data.jobs)) {
      return { found: false, error: 'No jobs data in response' }
    }

    // Filter for remote positions (telecommuting = true or title includes 'remote')
    const remoteJobs = data.jobs.filter((job: any) => {
      const isRemote = job.telecommuting === true
      const titleLower = job.title?.toLowerCase() || ''
      return isRemote || titleLower.includes('remote')
    })

    return {
      found: true,
      company: {
        slug,
        name: data.name || slug,
        jobCount: data.jobs.length,
        remoteJobCount: remoteJobs.length
      },
      jobs: remoteJobs.slice(0, 10).map((job: any) => {
        // Build location from city/country
        let location = 'Remote'
        if (job.city && job.country) {
          location = `${job.city}, ${job.country}`
        } else if (job.country) {
          location = job.country
        }
        return {
          id: `workable-${job.shortcode || job.id}`,
          title: job.title,
          location,
          departments: job.department ? [job.department] : [],
          url: job.url || job.application_url
        }
      })
    }
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Search for a company across all supported sources
 */
export async function searchCompany(
  source: string,
  query: string
): Promise<CompanySearchResult> {
  const sourceLower = source.toLowerCase()

  if (sourceLower === 'greenhouse') {
    return searchGreenhouseCompany(query)
  } else if (sourceLower === 'lever') {
    return searchLeverCompany(query)
  } else if (sourceLower === 'workable') {
    return searchWorkableCompany(query)
  } else if (sourceLower === 'remoteok') {
    return searchRemoteOKCompany(query)
  } else if (sourceLower === 'himalayas') {
    return searchHimalayasCompany(query)
  } else if (sourceLower === 'all') {
    // Try all sources in order
    const sources = ['greenhouse', 'lever', 'workable', 'remoteok', 'himalayas']
    for (const src of sources) {
      const result = await searchCompany(src, query)
      if (result.found) {
        return result
      }
    }
    return {
      found: false,
      error: 'Company not found on any source'
    }
  } else {
    return {
      found: false,
      error: `Unsupported source: ${source}. Supported sources: Greenhouse, Lever, Workable, RemoteOK, Himalayas, All`
    }
  }
}

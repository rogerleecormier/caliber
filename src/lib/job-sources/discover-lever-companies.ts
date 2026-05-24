#!/usr/bin/env node
/**
 * Lever Companies Discovery Script
 * 
 * Discovers new SaaS and tech companies using Lever ATS
 * by testing curated lists and pattern variations.
 * 
 * Filters for companies with remote jobs and suggests categories.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { getAllCompanies } from './company-sources.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const JSON_PATH = path.join(__dirname, 'lever-companies.json')

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

interface DiscoveredCompany {
  slug: string
  jobCount: number
  remoteJobCount: number
  departments: string[]
  suggestedCategory: string
  sampleJobs: string[]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function testCompany(slug: string): Promise<DiscoveredCompany | null> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    
    if (!response.ok) {
      return null
    }
    
    const jobs = await response.json()
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return null
    }
    
    // Filter for remote positions
    const remoteJobs = jobs.filter((job: any) => {
      const location = job.categories?.location?.toLowerCase() || ''
      const commitment = job.categories?.commitment?.toLowerCase() || ''
      const description = job.descriptionPlain?.toLowerCase() || ''
      
      return location.includes('remote') || 
             commitment.includes('remote') ||
             description.includes('remote')
    })
    
    if (remoteJobs.length === 0) {
      return null // Only interested in companies with remote jobs
    }
    
    // Extract departments
    const departments = new Set<string>()
    remoteJobs.forEach((job: any) => {
      if (job.categories?.team) departments.add(job.categories.team)
      if (job.categories?.department) departments.add(job.categories.department)
    })
    
    // Get sample job titles (up to 5)
    const sampleJobs = remoteJobs.slice(0, 5).map((job: any) => job.text)
    
    // Suggest category based on job titles and departments
    const suggestedCategory = suggestCategory(sampleJobs, Array.from(departments))
    
    return {
      slug,
      jobCount: jobs.length,
      remoteJobCount: remoteJobs.length,
      departments: Array.from(departments),
      suggestedCategory,
      sampleJobs
    }
    
  } catch (error) {
    return null
  }
}

function suggestCategory(jobTitles: string[], departments: string[]): string {
  const allText = [...jobTitles, ...departments].join(' ').toLowerCase()
  
  // Category detection keywords
  const categories = {
    'tech-giants': ['enterprise', 'global', 'director', 'vp', 'principal'],
    'saas-products': ['product', 'saas', 'software', 'application'],
    'developer-tools': ['developer', 'api', 'sdk', 'platform', 'tools', 'engineering'],
    'crypto-web3': ['crypto', 'blockchain', 'web3', 'token', 'defi', 'nft']
  }
  
  let maxScore = 0
  let bestCategory = 'saas-products' // default
  
  Object.entries(categories).forEach(([category, keywords]) => {
    const score = keywords.reduce((sum, keyword) => {
      return sum + (allText.includes(keyword) ? 1 : 0)
    }, 0)
    
    if (score > maxScore) {
      maxScore = score
      bestCategory = category
    }
  })
  
  return bestCategory
}

function generateSlugVariations(company: string): string[] {
  const variations: string[] = []
  
  // Clean the company name
  const cleaned = company.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .trim()
  
  // Only generate the most common variations:
  
  // 1. Replace spaces with hyphens (most common)
  const hyphenated = cleaned.replace(/\s+/g, '-')
  variations.push(hyphenated)
  
  // 2. Remove spaces entirely (second most common)
  const nospaces = cleaned.replace(/\s+/g, '')
  if (nospaces !== hyphenated) {
    variations.push(nospaces)
  }
  
  // 3. Original with spaces (rare but some use it)
  if (cleaned !== hyphenated && cleaned !== nospaces) {
    variations.push(cleaned)
  }
  
  // Remove duplicates and return
  return [...new Set(variations)]
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔍 Lever Companies Discovery Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Load existing database
  const existingData: CompanyDatabase = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  
  // Get existing companies
  const existingCompanies = new Set<string>()
  Object.values(existingData.categories).forEach(category => {
    category.companies.forEach(c => existingCompanies.add(c))
  })
  
  console.log(`📊 Current database has ${existingCompanies.size} companies`)
  
  // Get potential companies to test
  const potentialCompanies = getAllCompanies()
  console.log(`🎯 Testing ${potentialCompanies.length} potential companies from curated lists\n`)
  
  // Generate variations for each company
  const allVariations = new Set<string>()
  potentialCompanies.forEach(company => {
    const variations = generateSlugVariations(company)
    variations.forEach(v => allVariations.add(v))
  })
  
  // Filter out already existing companies
  const companySlugsToTest = new Set<string>()
  allVariations.forEach(slug => {
    if (!existingCompanies.has(slug)) {
      companySlugsToTest.add(slug)
    }
  })
  
  const totalVariations = allVariations.size
  const alreadyInDb = totalVariations - companySlugsToTest.size
  
  console.log(`🔬 Generated ${totalVariations} slug variations to test`)
  console.log(`⏭️  Skipping ${alreadyInDb} already in database`)
  console.log(`🎯 Will test ${companySlugsToTest.size} new companies\n`)
  
  const discovered: DiscoveredCompany[] = []
  let tested = 0
  const total = companySlugsToTest.size
  
  console.log('🔍 Testing companies (this may take a while)...\n')
  
  for (const slug of companySlugsToTest) {
    tested++
    
    // Show progress every 5 companies or on first/last
    if (tested === 1 || tested % 5 === 0 || tested === total) {
      console.log(`   Progress: ${tested}/${total} (${((tested/total)*100).toFixed(1)}%)`)
    }
    
    const result = await testCompany(slug)
    
    if (result) {
      discovered.push(result)
      console.log(`✅ ${slug}: ${result.remoteJobCount} remote jobs`)
    }
    
    // Rate limiting - 500ms = 2 requests/second (respectful)
    await sleep(500)
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📈 Discovery Results')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  console.log(`🔬 Companies tested: ${tested}`)
  console.log(`✅ Companies discovered: ${discovered.length}`)
  console.log(`🎯 Success rate: ${((discovered.length / tested) * 100).toFixed(1)}%`)
  
  if (discovered.length === 0) {
    console.log('\n😔 No new companies discovered.')
    return
  }
  
  const totalRemoteJobs = discovered.reduce((sum, c) => sum + c.remoteJobCount, 0)
  console.log(`💼 Total remote jobs available: ${totalRemoteJobs}`)
  
  // Add discovered companies to database
  discovered.forEach(company => {
    const category = company.suggestedCategory
    if (!existingData.categories[category]) {
      // If category doesn't exist, default to saas-products
      existingData.categories['saas-products'].companies.push(company.slug)
    } else {
      existingData.categories[category].companies.push(company.slug)
    }
  })
  
  // Sort companies in each category
  Object.values(existingData.categories).forEach(category => {
    category.companies.sort()
  })
  
  // Update metadata
  existingData.lastUpdated = new Date().toISOString().split('T')[0]
  
  // Save
  fs.writeFileSync(JSON_PATH, JSON.stringify(existingData, null, 2))
  
  console.log(`✅ Added ${discovered.length} companies to database`)
  console.log(`📄 Updated: ${JSON_PATH}`)
}

main().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})

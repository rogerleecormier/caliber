#!/usr/bin/env node
/**
 * Greenhouse Companies Cleanup Script
 * 
 * Tests all companies in greenhouse-companies.json and removes those
 * that consistently return 404 errors or are no longer using Greenhouse.
 * 
 * Creates a backup before making changes.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const JSON_PATH = path.join(__dirname, 'greenhouse-companies.json')
const BACKUP_DIR = path.join(__dirname, '.backups')

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

interface TestResult {
  company: string
  category: string
  status: 'success' | '404' | 'error' | 'timeout'
  hasJobs: boolean
  hasRemoteJobs: boolean
  jobCount: number
  remoteJobCount: number
  message?: string
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function testCompany(slug: string, retries = 2): Promise<Omit<TestResult, 'category'>> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      
      if (response.status === 404) {
        return {
          company: slug,
          status: '404',
          hasJobs: false,
          hasRemoteJobs: false,
          jobCount: 0,
          remoteJobCount: 0,
          message: 'No job board found'
        }
      }
      
      if (!response.ok) {
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1)) // Exponential backoff
          continue
        }
        return {
          company: slug,
          status: 'error',
          hasJobs: false,
          hasRemoteJobs: false,
          jobCount: 0,
          remoteJobCount: 0,
          message: `HTTP ${response.status}`
        }
      }
      
      const data = await response.json() as any

      if (!data.jobs || !Array.isArray(data.jobs)) {
        return {
          company: slug,
          status: 'success',
          hasJobs: false,
          hasRemoteJobs: false,
          jobCount: 0,
          remoteJobCount: 0,
          message: 'No jobs array'
        }
      }
      
      const remoteJobs = data.jobs.filter((job: any) => {
        const locationName = job.location?.name?.toLowerCase() || ''
        return locationName.includes('remote')
      })
      
      return {
        company: slug,
        status: 'success',
        hasJobs: true,
        hasRemoteJobs: remoteJobs.length > 0,
        jobCount: data.jobs.length,
        remoteJobCount: remoteJobs.length,
        message: `${data.jobs.length} total, ${remoteJobs.length} remote`
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1))
          continue
        }
        return {
          company: slug,
          status: 'timeout',
          hasJobs: false,
          hasRemoteJobs: false,
          jobCount: 0,
          remoteJobCount: 0,
          message: 'Request timeout'
        }
      }
      
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      
      return {
        company: slug,
        status: 'error',
        hasJobs: false,
        hasRemoteJobs: false,
        jobCount: 0,
        remoteJobCount: 0,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  // Should never reach here, but TypeScript needs this
  return {
    company: slug,
    status: 'error',
    hasJobs: false,
    hasRemoteJobs: false,
    jobCount: 0,
    remoteJobCount: 0,
    message: 'Max retries exceeded'
  }
}

function createBackup(data: CompanyDatabase): string {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const backupPath = path.join(BACKUP_DIR, `greenhouse-companies-${timestamp}.json`)
  
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2))
  return backupPath
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧹 Greenhouse Companies Cleanup Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Load current data
  const data: CompanyDatabase = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  
  // Create backup
  const backupPath = createBackup(data)
  console.log(`✅ Backup created: ${path.basename(backupPath)}\n`)
  
  // Collect all companies with their categories
  const allCompanies: Array<{ category: string; company: string }> = []
  Object.entries(data.categories).forEach(([key, category]) => {
    category.companies.forEach(company => {
      allCompanies.push({ category: key, company })
    })
  })
  
  console.log(`📊 Testing ${allCompanies.length} companies...\n`)
  
  const results: TestResult[] = []
  let tested = 0
  
  for (const { category, company } of allCompanies) {
    tested++
    const result = await testCompany(company)
    results.push({ ...result, category })
    
    // Log progress
    const status = result.status === 'success' 
      ? (result.hasRemoteJobs ? '✅' : '➖')
      : result.status === '404' ? '❌' : '⚠️'
    
    console.log(`[${tested}/${allCompanies.length}] ${status} ${company}: ${result.message}`)
    
    // Rate limiting
    await sleep(1000)
  }
  
  // Analyze results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📈 Cleanup Analysis')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  const toRemove = results.filter(r => r.status === '404')
  const timeouts = results.filter(r => r.status === 'timeout')
  const errors = results.filter(r => r.status === 'error')
  const success = results.filter(r => r.status === 'success')
  const withRemoteJobs = results.filter(r => r.hasRemoteJobs)
  const noRemoteJobs = results.filter(r => r.status === 'success' && !r.hasRemoteJobs)
  
  console.log(`📊 Total companies tested: ${results.length}`)
  console.log(`✅ Successful (valid boards): ${success.length}`)
  console.log(`🎯 With remote jobs: ${withRemoteJobs.length}`)
  console.log(`➖ No remote jobs: ${noRemoteJobs.length}`)
  console.log(`❌ 404 errors (will remove): ${toRemove.length}`)
  console.log(`⚠️  Timeouts: ${timeouts.length}`)
  console.log(`⚠️  Other errors: ${errors.length}`)
  
  if (toRemove.length === 0) {
    console.log('\n✨ No companies to remove! Database is clean.')
    return
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🗑️  Companies to Remove (404 errors)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Group removals by category
  const removalsByCategory = new Map<string, string[]>()
  toRemove.forEach(r => {
    if (!removalsByCategory.has(r.category)) {
      removalsByCategory.set(r.category, [])
    }
    removalsByCategory.get(r.category)!.push(r.company)
  })
  
  removalsByCategory.forEach((companies, category) => {
    console.log(`${data.categories[category].name}:`)
    companies.forEach(c => console.log(`  - ${c}`))
    console.log()
  })
  
  // Remove 404 companies
  toRemove.forEach(result => {
    const category = data.categories[result.category]
    const index = category.companies.indexOf(result.company)
    if (index > -1) {
      category.companies.splice(index, 1)
    }
  })
  
  // Update metadata
  data.lastUpdated = new Date().toISOString().split('T')[0]
  
  // Save updated JSON
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2))
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✨ Cleanup Complete!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`\n✅ Removed ${toRemove.length} companies with 404 errors`)
  console.log(`💾 Backup saved: ${path.basename(backupPath)}`)
  console.log(`📄 Updated: ${JSON_PATH}`)
  console.log('\n🎯 Database now has:')
  
  const totalRemaining = Object.values(data.categories).reduce((sum, cat) => sum + cat.companies.length, 0)
  console.log(`   ${totalRemaining} companies (was ${allCompanies.length})`)
  console.log(`   ${withRemoteJobs.length} with remote jobs`)
  console.log(`   ${((withRemoteJobs.length / totalRemaining) * 100).toFixed(1)}% success rate\n`)
}

main().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})

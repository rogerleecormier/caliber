#!/usr/bin/env node
/**
 * Lever Companies Cleanup Script
 * 
 * Tests all companies in lever-companies.json and removes those
 * that consistently return 404 errors.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const JSON_PATH = path.join(__dirname, 'lever-companies.json')
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
}

interface TestResult {
  company: string
  category: string
  status: 'success' | '404' | 'error' | 'timeout'
  message?: string
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function testCompany(slug: string, retries = 2): Promise<Omit<TestResult, 'category'>> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      
      if (response.status === 404) {
        return {
          company: slug,
          status: '404',
          message: 'No job board found'
        }
      }
      
      if (!response.ok) {
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1))
          continue
        }
        return {
          company: slug,
          status: 'error',
          message: `HTTP ${response.status}`
        }
      }
      
      return {
        company: slug,
        status: 'success',
        message: 'Valid board'
      }
      
    } catch (error) {
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      return {
        company: slug,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  return {
    company: slug,
    status: 'error',
    message: 'Max retries exceeded'
  }
}

function createBackup(data: CompanyDatabase): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const backupPath = path.join(BACKUP_DIR, `lever-companies-${timestamp}.json`)
  
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2))
  return backupPath
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧹 Lever Companies Cleanup Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  const data: CompanyDatabase = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  const backupPath = createBackup(data)
  console.log(`✅ Backup created: ${path.basename(backupPath)}\n`)
  
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
    
    const status = result.status === 'success' ? '✅' : result.status === '404' ? '❌' : '⚠️'
    console.log(`[${tested}/${allCompanies.length}] ${status} ${company}: ${result.message}`)
    
    await sleep(1000)
  }
  
  const toRemove = results.filter(r => r.status === '404')
  
  if (toRemove.length === 0) {
    console.log('\n✨ No companies to remove! Database is clean.')
    return
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🗑️  Companies to Remove (404 errors)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  toRemove.forEach(r => {
    console.log(`- ${r.company} (${data.categories[r.category].name})`)
    
    const category = data.categories[r.category]
    const index = category.companies.indexOf(r.company)
    if (index > -1) {
      category.companies.splice(index, 1)
    }
  })
  
  data.lastUpdated = new Date().toISOString().split('T')[0]
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2))
  
  console.log(`\n✅ Removed ${toRemove.length} companies`)
  console.log(`📄 Updated: ${JSON_PATH}`)
}

main().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})

import fs from 'fs'
import { determineCategoryId } from '../src/lib/job-sources/categorization'

interface JobResult {
  id: number
  title: string
  description: string | null
}

interface D1Result {
  results: JobResult[]
}

async function main() {
  console.log('Reading jobs_to_check.json...')
  const rawData = fs.readFileSync('jobs_to_check.json', 'utf-8')
  const data = JSON.parse(rawData) as D1Result[]
  
  const jobs = data[0]?.results || []
  console.log(`Found ${jobs.length} jobs to check.`)
  
  const idsToMove: number[] = []
  
  for (const job of jobs) {
    const newCategoryId = determineCategoryId(job.title, job.description || '')
    if (newCategoryId === 9) {
      idsToMove.push(job.id)
    }
  }
  
  console.log(`Found ${idsToMove.length} jobs to move to Product Management (ID: 9).`)
  
  if (idsToMove.length > 0) {
    // SQLite limit for IN clause is usually high, but let's be safe and chunk if huge.
    // 1000 is safe.
    const chunkSize = 500
    let sqlContent = ''
    
    for (let i = 0; i < idsToMove.length; i += chunkSize) {
      const chunk = idsToMove.slice(i, i + chunkSize)
      const idsStr = chunk.join(',')
      sqlContent += `UPDATE jobs SET category_id = 9, updated_at = unixepoch() WHERE id IN (${idsStr});\n`
    }
    
    fs.writeFileSync('update_remote_jobs.sql', sqlContent)
    console.log('Generated update_remote_jobs.sql')
  } else {
    console.log('No jobs to move.')
    fs.writeFileSync('update_remote_jobs.sql', '-- No jobs to update')
  }
}

main()

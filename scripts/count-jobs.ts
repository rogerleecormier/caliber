import { getPlatformProxy } from 'wrangler'
import { getDb } from '../src/db/db'
import { jobs } from '../src/db/schema'

async function main() {
  const { env } = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  })
  
  const db = getDb(env.DB)
  const allJobs = await db.select().from(jobs)
  console.log(`Total jobs in DB: ${allJobs.length}`)
  
  if (allJobs.length > 0) {
    const byCategory = allJobs.reduce((acc, job) => {
      acc[job.categoryId] = (acc[job.categoryId] || 0) + 1
      return acc
    }, {} as Record<number, number>)
    console.log('Jobs by category:', byCategory)
  }
  
  process.exit(0)
}

main()

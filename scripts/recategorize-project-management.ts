import { eq } from 'drizzle-orm'
import { getPlatformProxy } from 'wrangler'
import { getDb } from '../src/db/db'
import { jobs } from '../src/db/schema'
import { determineCategoryId } from '../src/lib/job-sources/categorization'

async function main() {
  console.log('Initializing DB connection...')
  const { env } = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  })
  
  const db = getDb(env.DB)

  console.log('Fetching existing Project Management jobs (ID: 2)...')
  const projectJobs = await db.select().from(jobs).where(eq(jobs.categoryId, 2))
  
  console.log(`Found ${projectJobs.length} jobs to check.`)
  
  let movedCount = 0
  let keptCount = 0
  
  for (const job of projectJobs) {
    // We pass empty tags array as we don't have tags in the job table easily accessible or needed for this specific split usually
    // If tags are critical, we might need to fetch them or parse them if stored in a column, but determineCategoryId handles empty tags.
    // The job table doesn't seem to have a tags column in the schema I saw earlier, wait, let me check schema again.
    // Schema has 'tags' in RawJobListing but not in 'jobs' table explicitly? 
    // Ah, schema.ts for 'jobs' table:
    // title, company, description, fullDescription, payRange, postDate, sourceUrl, sourceName, categoryId, remoteType, createdAt, updatedAt.
    // No tags column in 'jobs' table. So we rely on title and description.
    
    const newCategoryId = determineCategoryId(job.title, job.description || '')
    
    if (newCategoryId === 9) {
      console.log(`Moving "${job.title}" to Product Management (ID: 9)`)
      await db.update(jobs)
        .set({ categoryId: 9, updatedAt: new Date() })
        .where(eq(jobs.id, job.id))
      movedCount++
    } else {
      // It might remain 2, or determineCategoryId might even think it's something else (unlikely if it was already 2, but possible if logic changed drastically)
      // We only care about moving to 9 for this specific task.
      // Actually, if determineCategoryId returns something else entirely (like 1), should we move it?
      // The user asked to "re-categorize existing project management jobs". 
      // Safest is to only move if it detects as Product Management (9). 
      // If it detects as 1 (Dev) but was 2, maybe we should leave it or update it?
      // Given the prompt "split off product management", I will focus on moving to 9.
      if (newCategoryId !== 2) {
         console.log(`Job "${job.title}" detected as ID ${newCategoryId}, but keeping as 2 for now to be safe (only targeting Product Management split).`)
      }
      keptCount++
    }
  }
  
  console.log('Re-categorization complete.')
  console.log(`Moved: ${movedCount}`)
  console.log(`Kept: ${keptCount}`)
  
  process.exit(0)
}

main()

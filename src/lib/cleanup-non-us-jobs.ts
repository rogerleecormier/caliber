import { linkedinJobResults, pipelineJobs } from '@/db/schema'
import { sql, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from '@/db/db'

function isUSLocation(location: string | null): boolean {
  if (!location) return false
  const normalized = location.toLowerCase()
  const usIndicators = ['united states', 'usa', 'us,', ', us']
  return usIndicators.some((indicator) => normalized.includes(indicator))
}

export async function cleanupNonUSJobs(db: DrizzleD1Database): Promise<{ deletedLinkedin: number; deletedPipeline: number }> {
  // Get all jobs and filter in memory
  const allLinkedinJobs = await db.select().from(linkedinJobResults)
  const allPipelineJobs = await db.select().from(pipelineJobs)

  const nonUSLinkedinIds = allLinkedinJobs
    .filter((job) => !isUSLocation(job.location))
    .map((job) => job.id)

  const nonUSPipelineIds = allPipelineJobs
    .filter((job) => !isUSLocation(job.location))
    .map((job) => job.id)

  let deletedLinkedin = 0
  let deletedPipeline = 0

  // Delete in batches to avoid hitting query parameter limits
  const batchSize = 20

  if (nonUSLinkedinIds.length > 0) {
    for (let i = 0; i < nonUSLinkedinIds.length; i += batchSize) {
      const batch = nonUSLinkedinIds.slice(i, i + batchSize)
      await db.delete(linkedinJobResults).where(inArray(linkedinJobResults.id, batch))
      deletedLinkedin += batch.length
    }
  }

  if (nonUSPipelineIds.length > 0) {
    for (let i = 0; i < nonUSPipelineIds.length; i += batchSize) {
      const batch = nonUSPipelineIds.slice(i, i + batchSize)
      try {
        await db.delete(pipelineJobs).where(inArray(pipelineJobs.id, batch))
        deletedPipeline += batch.length
      } catch (error) {
        // If batch fails, try deleting one by one
        for (const id of batch) {
          try {
            await db.delete(pipelineJobs).where(inArray(pipelineJobs.id, [id]))
            deletedPipeline += 1
          } catch (singleError) {
            console.error(`Failed to delete pipeline job ${id}:`, singleError)
          }
        }
      }
    }
  }

  return { deletedLinkedin, deletedPipeline }
}

import { db } from '@/db'
import { linkedinJobResults, pipelineJobs } from '@/db/schema'
import { sql } from 'drizzle-orm'

function isUSLocation(location: string | null): boolean {
  if (!location) return false
  const normalized = location.toLowerCase()
  const usIndicators = ['united states', 'usa', 'us,', ', us']
  return usIndicators.some((indicator) => normalized.includes(indicator))
}

export async function cleanupNonUSJobs(): Promise<{ deletedLinkedin: number; deletedPipeline: number }> {
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

  if (nonUSLinkedinIds.length > 0) {
    const result = await db
      .delete(linkedinJobResults)
      .where(sql`id IN (${sql.join(nonUSLinkedinIds, sql`,`)})`)
    deletedLinkedin = nonUSLinkedinIds.length
  }

  if (nonUSPipelineIds.length > 0) {
    const result = await db
      .delete(pipelineJobs)
      .where(sql`id IN (${sql.join(nonUSPipelineIds, sql`,`)})`)
    deletedPipeline = nonUSPipelineIds.length
  }

  return { deletedLinkedin, deletedPipeline }
}

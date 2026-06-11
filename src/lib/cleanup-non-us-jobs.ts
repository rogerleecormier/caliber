import { normalizedJobs } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from '@/db/db'
import { isUSLocation } from '@/lib/normalized-jobs-persistence'

export async function cleanupNonUSJobs(db: DrizzleD1Database): Promise<{ deleted: number }> {
  const allJobs = await db.select({ id: normalizedJobs.id, location: normalizedJobs.location }).from(normalizedJobs)

  const nonUSIds = allJobs
    .filter((job) => !isUSLocation(job.location))
    .map((job) => job.id)

  let deleted = 0
  const batchSize = 20

  for (let i = 0; i < nonUSIds.length; i += batchSize) {
    const batch = nonUSIds.slice(i, i + batchSize)
    await db.delete(normalizedJobs).where(inArray(normalizedJobs.id, batch))
    deleted += batch.length
  }

  return { deleted }
}

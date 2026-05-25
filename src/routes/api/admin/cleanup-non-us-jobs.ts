import { defineEventHandler } from 'h3'
import { cleanupNonUSJobs } from '@/lib/cleanup-non-us-jobs'

export default defineEventHandler(async (event) => {
  try {
    const result = await cleanupNonUSJobs()
    return {
      success: true,
      message: `Deleted ${result.deletedLinkedin} non-US LinkedIn jobs and ${result.deletedPipeline} non-US pipeline jobs`,
      ...result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

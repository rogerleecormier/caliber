import type { JobSource } from './types'
import { fetchGreenhouseJobs } from './greenhouse'
import { fetchLeverJobs } from './lever'
import { fetchWorkableJobs } from './workable'

export const jobSources: JobSource[] = [
  {
    name: 'Greenhouse',
    fetch: fetchGreenhouseJobs
  },
  {
    name: 'Lever',
    fetch: fetchLeverJobs
  },
  {
    name: 'Workable',
    fetch: fetchWorkableJobs
  }
]

export { fetchGreenhouseJobs } from './greenhouse'
export { fetchLeverJobs } from './lever'
export { fetchWorkableJobs } from './workable'
export { determineCategoryId } from './categorization'
export type { RawJobListing, JobSource } from './types'



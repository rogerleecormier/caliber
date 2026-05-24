import { fetchLeverJobs } from './job-sources/lever'

async function test() {
  console.log('Testing Lever Job Fetch...')
  const generator = fetchLeverJobs()
  
  for await (const jobs of generator) {
    console.log(`Received batch of ${jobs.length} jobs`)
    if (jobs.length > 0) {
      console.log('Sample job:', JSON.stringify(jobs[0], null, 2))
    }
  }
  console.log('Done!')
}

test().catch(console.error)

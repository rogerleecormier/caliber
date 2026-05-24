
import { fetchRemoteOKJobs } from '../src/lib/job-sources/remoteok';
import { fetchHimalayasJobs } from '../src/lib/job-sources/himalayas';

async function run() {
  console.log('--- Testing RemoteOK ---');
  const remoteOkGen = fetchRemoteOKJobs();
  let remoteOkCount = 0;
  for await (const jobs of remoteOkGen) {
    remoteOkCount += jobs.length;
    console.log(`RemoteOK fetched ${jobs.length} jobs`);
    if (jobs.length > 0) {
      console.log(`First job: ${jobs[0].title} @ ${jobs[0].company}`);
      console.log(`Date: ${jobs[0].postedDate}`);
    }
    // Just get the first batch to see total if possible, but fetchRemoteOKJobs yields everything in one go usually?
    // remoteok.ts yields processedJobs.slice(...)
    // If we don't pass limit, it yields everything.
    break; 
  }

  console.log('\n--- Testing Himalayas ---');
  const himalayasGen = fetchHimalayasJobs(undefined, console.log, undefined, 0, 20);
  for await (const jobs of himalayasGen) {
    console.log(`Himalayas fetched ${jobs.length} jobs`);
    if (jobs.length > 0) {
      console.log(`First job: ${jobs[0].title} @ ${jobs[0].company}`);
      console.log(`Date: ${jobs[0].postedDate}`);
    }
    break; // Just first batch
  }
}

run().catch(console.error);


import { drizzle } from 'drizzle-orm/d1';
import * as schema from './src/db/schema';
import { getPlatformProxy } from 'wrangler';

async function main() {
  console.log('Connecting to DB...');
  try {
    const platform = await getPlatformProxy({
      configPath: './wrangler.toml',
      persist: { path: '.wrangler/state/v3' },
    });
    
    const db = drizzle(platform.env.DB, { schema });

    const jobsCount = await db.select().from(schema.jobs).execute();
    console.log(`Total jobs: ${jobsCount.length}`);

    const categoriesCount = await db.select().from(schema.categories).execute();
    console.log(`Total categories: ${categoriesCount.length}`);

    if (jobsCount.length > 0) {
      const job = jobsCount[0];
      console.log('Sample job:', JSON.stringify(job, null, 2));
      
      if (job.categoryId) {
        const category = categoriesCount.find(c => c.id === job.categoryId);
        console.log('Linked category:', category);
      } else {
        console.log('Sample job has no categoryId');
      }
    }

    // Check for orphaned jobs
    const orphanedJobs = jobsCount.filter(j => !categoriesCount.find(c => c.id === j.categoryId));
    console.log(`Orphaned jobs (invalid categoryId): ${orphanedJobs.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

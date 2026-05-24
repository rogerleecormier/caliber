
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

    const jobs = await db.select().from(schema.jobs).execute();
    
    // Group by createdAt (rounded to minute)
    const timeMap = new Map<string, number>();
    
    for (const job of jobs) {
        if (job.createdAt) {
            const date = new Date(job.createdAt);
            // Round to minute
            date.setSeconds(0, 0);
            const key = date.toISOString();
            timeMap.set(key, (timeMap.get(key) || 0) + 1);
        } else {
            timeMap.set('null', (timeMap.get('null') || 0) + 1);
        }
    }

    console.log('\nJobs by Creation Time:');
    const sortedTimes = Array.from(timeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [time, count] of sortedTimes) {
        console.log(`${time}: ${count} jobs`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

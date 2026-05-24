
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
    console.log(`Total jobs: ${jobs.length}`);

    const sourceMap = new Map<string, number>();
    for (const job of jobs) {
        const source = job.sourceName || 'Unknown';
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    }

    console.log('\nJobs by Source:');
    const sortedSources = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);
    for (const [source, count] of sortedSources) {
        console.log(`${source}: ${count}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

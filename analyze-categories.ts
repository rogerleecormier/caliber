
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './src/db/schema';
import { getPlatformProxy } from 'wrangler';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Connecting to DB...');
  try {
    const platform = await getPlatformProxy({
      configPath: './wrangler.toml',
      persist: { path: '.wrangler/state/v3' },
    });
    
    const db = drizzle(platform.env.DB, { schema });

    const categories = await db.select().from(schema.categories).execute();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const jobs = await db.select().from(schema.jobs).execute();
    console.log(`Total jobs: ${jobs.length}`);

    const counts = new Map<string, number>();
    for (const job of jobs) {
        const catName = categoryMap.get(job.categoryId) || 'Unknown';
        counts.set(catName, (counts.get(catName) || 0) + 1);
    }

    console.log('\nJobs by Category:');
    const sortedCounts = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCounts) {
        console.log(`${cat}: ${count}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

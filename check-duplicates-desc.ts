
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

    // Group by Company + Description (first 100 chars)
    const groups = new Map<string, any[]>();
    for (const job of jobs) {
        if (!job.description || !job.company) continue;
        
        // Normalize
        const descStart = job.description.substring(0, 100).trim();
        const key = `${job.company.trim()}|${descStart}`;
        
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(job);
    }

    let duplicateGroups = 0;
    let printed = 0;
    for (const [key, group] of groups.entries()) {
        if (group.length > 1) {
            duplicateGroups++;
            if (printed < 5) {
                console.log(`\nDuplicate Group: ${key.substring(0, 50)}...`);
                group.forEach(j => {
                    console.log(` - ID: ${j.id}, Title: "${j.title}", Source: ${j.sourceName}`);
                });
                printed++;
            }
        }
    }
    console.log(`\nTotal groups with duplicates (by Desc): ${duplicateGroups}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

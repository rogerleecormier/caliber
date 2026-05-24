
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
    
    // Group by Title + Company
    const groups = new Map<string, any[]>();
    for (const job of jobs) {
        const key = `${job.title}|${job.company}`;
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
            if (printed < 3) {
                console.log(`\nDuplicate Group: ${key}`);
                group.forEach(j => {
                    console.log(` - ID: ${j.id}, Source: ${j.sourceName}, URL: ${j.sourceUrl}`);
                });
                printed++;
            }
        }
    }
    console.log(`\nTotal groups with duplicates: ${duplicateGroups}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();


import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
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

    console.log('Resetting database...');

    // Delete from tables in order of dependency
    const tables = [
        schema.duplicateJobs,
        schema.jobs,
        schema.companyJobProgress,
        schema.discoveredCompanies,
        schema.syncHistory,
        schema.discoveryState,
        schema.potentialCompanies
    ];

    for (const table of tables) {
        try {
            // @ts-ignore - Drizzle types are tricky here
            await db.delete(table).execute();
            // @ts-ignore
            console.log(`Deleted ${table[Symbol.for('drizzle:Name')] || 'table'}`);
        } catch (error: any) {
            if (error.message?.includes('no such table')) {
                console.log(`Skipped missing table`);
            } else {
                console.error(`Error deleting table:`, error.message);
            }
        }
    }

    // Reset auto-increment counters (sqlite specific)
    await db.run(sql`DELETE FROM sqlite_sequence WHERE name IN ('jobs', 'duplicate_jobs', 'categories')`);
    console.log('Reset auto-increment counters');
    
    // Note: We are NOT deleting categories as they are likely static configuration.
    // If user wants full wipe, we can add that too, but usually categories are preserved.
    // User said "reset to 1", which implies jobs.

    console.log('Database reset complete.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

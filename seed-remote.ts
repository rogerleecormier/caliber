
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './src/db/schema';
import { getPlatformProxy } from 'wrangler';
import { POTENTIAL_COMPANIES } from './src/routes/api/v2/seed-potential-companies';

async function main() {
  console.log('Connecting to DB...');
  try {
    const platform = await getPlatformProxy({
      configPath: './wrangler.toml',
      persist: { path: '.wrangler/state/v3' },
    });
    
    const db = drizzle(platform.env.DB, { schema });

    console.log(`Seeding ${POTENTIAL_COMPANIES.length} companies...`);

    let added = 0;
    let skipped = 0;

    // Batch insert to be faster, but handle duplicates if any
    // Since we just wiped, we can probably just insert all.
    // But let's do it safely in chunks.
    
    const chunkSize = 50;
    for (let i = 0; i < POTENTIAL_COMPANIES.length; i += chunkSize) {
        const chunk = POTENTIAL_COMPANIES.slice(i, i + chunkSize);
        const values = chunk.map(slug => ({
            id: crypto.randomUUID(),
            slug,
            status: 'pending',
            checkCount: 0
        }));

        try {
            await db.insert(schema.potentialCompanies).values(values).execute();
            added += chunk.length;
            console.log(`Inserted chunk ${i/chunkSize + 1}`);
        } catch (e: any) {
            console.error(`Error inserting chunk starting at ${i}:`, e.message);
            // Fallback to individual insert if batch fails (e.g. one duplicate)
            for (const val of values) {
                try {
                    await db.insert(schema.potentialCompanies).values(val).execute();
                    added++;
                } catch (err) {
                    skipped++;
                }
            }
        }
    }

    console.log(`Seeding complete. Added: ${added}, Skipped: ${skipped}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

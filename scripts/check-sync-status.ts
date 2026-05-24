
import { getD1Database } from '@caliber/shared-utils';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '../src/db/db';
import { sql, desc, eq } from 'drizzle-orm';

async function run() {
  const d1 = await getD1Database();
  const db = drizzle(d1, { schema });

  console.log('--- Company Job Progress (Aggregators) ---');
  const progress = await db.select().from(schema.companyJobProgress)
    .where(sql`company_slug IN ('remoteok', 'himalayas')`);
  
  progress.forEach(p => {
    console.log(`${p.companySlug}: Offset ${p.lastJobOffset}, Last Synced ${p.lastSyncedAt}`);
  });

  console.log('\n--- Recent Jobs Added (Last 50) ---');
  const recentJobs = await db.select({
    source: schema.jobs.sourceName,
    company: schema.jobs.company,
    title: schema.jobs.title,
    createdAt: schema.jobs.createdAt
  })
  .from(schema.jobs)
  .orderBy(desc(schema.jobs.createdAt))
  .limit(50);

  const sourceCounts: Record<string, number> = {};
  recentJobs.forEach(j => {
    const source = j.source || 'Unknown';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  console.log('Source distribution of last 50 jobs:');
  console.log(sourceCounts);
}

run().catch(console.error);

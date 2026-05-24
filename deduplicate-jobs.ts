
import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray } from 'drizzle-orm';
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
    console.log(`Total jobs before cleanup: ${jobs.length}`);

    // Group by Title + Company
    const groups = new Map<string, any[]>();
    for (const job of jobs) {
        // Normalize key to be safe
        const key = `${job.title?.trim()}|${job.company?.trim()}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(job);
    }

    const idsToDelete: number[] = [];
    let keptCount = 0;

    for (const [key, group] of groups.entries()) {
        if (group.length === 1) {
            keptCount++;
            continue;
        }

        // Sort to find the best one to keep
        // We want to KEEP the first one in this sorted list
        group.sort((a, b) => {
            // 1. Priority: Direct Source vs Aggregator
            const aIsDirect = isDirectSource(a.sourceName);
            const bIsDirect = isDirectSource(b.sourceName);
            
            if (aIsDirect && !bIsDirect) return -1; // a comes first (keep a)
            if (!aIsDirect && bIsDirect) return 1;  // b comes first (keep b)

            // 2. Tie-breaker: Latest createdAt (if available)
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (aTime !== bTime) {
                return bTime - aTime; // Newest first
            }

            // 3. Fallback: Higher ID (likely newer)
            return b.id - a.id;
        });

        const toKeep = group[0];
        const toDelete = group.slice(1);

        // console.log(`Keeping: ${toKeep.id} (${toKeep.sourceName}) - ${key}`);
        toDelete.forEach(j => idsToDelete.push(j.id));
        keptCount++;
    }

    console.log(`Jobs to keep: ${keptCount}`);
    console.log(`Jobs to delete: ${idsToDelete.length}`);

    if (idsToDelete.length > 0) {
        // Delete in batches to avoid SQL limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
            const batch = idsToDelete.slice(i, i + BATCH_SIZE);
            await db.delete(schema.jobs).where(inArray(schema.jobs.id, batch)).execute();
            console.log(`Deleted batch ${i / BATCH_SIZE + 1}/${Math.ceil(idsToDelete.length / BATCH_SIZE)}`);
        }
        console.log('Cleanup complete.');
    } else {
        console.log('No duplicates found to delete.');
    }

    // Verify final count
    const finalJobs = await db.select().from(schema.jobs).execute();
    console.log(`Total jobs after Title+Company cleanup: ${finalJobs.length}`);

    // --- Pass 2: Deduplicate by Normalized Source URL ---
    console.log('\n--- Starting Pass 2: Normalized Source URL ---');
    
    const urlGroups = new Map<string, any[]>();
    for (const job of finalJobs) {
        let url = job.sourceUrl;
        try {
            const u = new URL(job.sourceUrl);
            url = u.origin + u.pathname;
        } catch (error) {
            // invalid url, ignore for this pass, but log it
            console.warn('Invalid URL encountered, skipping normalization:', job.sourceUrl, error);
        }
        
        if (!urlGroups.has(url)) {
            urlGroups.set(url, []);
        }
        urlGroups.get(url)!.push(job);
    }

    const urlIdsToDelete: number[] = [];
    let urlKeptCount = 0;

    for (const [url, group] of urlGroups.entries()) {
        if (group.length === 1) {
            urlKeptCount++;
            continue;
        }

        // Sort to find the best one to keep
        group.sort((a, b) => {
            // 1. Priority: Shortest URL (usually cleaner) vs Longest? 
            // Actually, we prefer the one without query params if possible, but we normalized them.
            // So just keep the one with the "cleanest" original URL?
            // Or just latest ID.
            return b.id - a.id;
        });

        const toKeep = group[0];
        const toDelete = group.slice(1);

        toDelete.forEach(j => urlIdsToDelete.push(j.id));
        urlKeptCount++;
    }

    console.log(`Jobs to keep (Pass 2): ${urlKeptCount}`);
    console.log(`Jobs to delete (Pass 2): ${urlIdsToDelete.length}`);

    if (urlIdsToDelete.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < urlIdsToDelete.length; i += BATCH_SIZE) {
            const batch = urlIdsToDelete.slice(i, i + BATCH_SIZE);
            await db.delete(schema.jobs).where(inArray(schema.jobs.id, batch)).execute();
            console.log(`Deleted batch ${i / BATCH_SIZE + 1}/${Math.ceil(urlIdsToDelete.length / BATCH_SIZE)}`);
        }
    }

    const reallyFinalJobs = await db.select().from(schema.jobs).execute();
    console.log(`Final Total jobs: ${reallyFinalJobs.length}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

function isDirectSource(sourceName: string | null): boolean {
    if (!sourceName) return false;
    const lower = sourceName.toLowerCase();
    return lower.includes('greenhouse') || lower.includes('lever') || lower.includes('ashby');
}

main();

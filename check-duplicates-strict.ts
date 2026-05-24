
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

    // Check for duplicates based on normalized sourceUrl
    const urlMap = new Map<string, any[]>();
    for (const job of jobs) {
        // Remove query params
        let url = job.sourceUrl;
        try {
            const u = new URL(job.sourceUrl);
            url = u.origin + u.pathname;
        } catch (e) {
            // invalid url, ignore
        }
        
        if (!urlMap.has(url)) {
            urlMap.set(url, []);
        }
        urlMap.get(url)!.push(job);
    }

    let duplicateUrls = 0;
    for (const [url, group] of urlMap.entries()) {
        if (group.length > 1) {
            duplicateUrls += group.length - 1;
        }
    }
    console.log(`Duplicates by Normalized Source URL: ${duplicateUrls}`);
    
    // Check for duplicates based on case-insensitive Title + Company
    const titleCompanyMap = new Map<string, any[]>();
    for (const job of jobs) {
        const key = `${job.title?.trim().toLowerCase()}|${job.company?.trim().toLowerCase()}`;
        if (!titleCompanyMap.has(key)) {
            titleCompanyMap.set(key, []);
        }
        titleCompanyMap.get(key)!.push(job);
    }
    
    let duplicateTitleCompany = 0;
    for (const [key, group] of titleCompanyMap.entries()) {
        if (group.length > 1) {
            duplicateTitleCompany += group.length - 1;
        }
    }
    console.log(`Duplicates by Case-Insensitive Title + Company: ${duplicateTitleCompany}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();

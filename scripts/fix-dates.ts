
import fs from 'node:fs';

async function main() {
  console.log('Fetching high-freshness jobs...');
  const updates: string[] = [];

  // 1. Himalayas
  try {
    console.log('Fetching Himalayas...');
    const hRes = await fetch('https://himalayas.app/jobs/api');
    const hData = await hRes.json() as any;
    
    for (const job of hData.jobs || []) {
      if (job.pubDate) {
        // Correct logic: Drizzle expects SECONDS. Himalayas gives SECONDS.
        // So use it directly.
        const seconds = job.pubDate;
        const url = job.applicationLink || job.url;
        if (url) {
            updates.push(`UPDATE jobs SET post_date = ${seconds} WHERE source_url = '${url.replace(/'/g, "''")}';`);
        }
      }
    }
  } catch (e) {
    console.error('Himalayas error:', e);
  }

  // 2. RemoteOK
  try {
    const tags = ['dev', 'engineer', 'devops', 'design', 'marketing', 'product', 'customer_success'];
    console.log('Fetching RemoteOK tags...');
    
    const processededIds = new Set<string>();

    for (const tag of tags) {
        const rRes = await fetch(`https://remoteok.com/api?tag=${tag}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const rData = await rRes.json() as any;
        const jobs = Array.isArray(rData) ? rData.slice(1) : []; 

        for (const job of jobs) {
            if (processededIds.has(job.id)) continue;
            processededIds.add(job.id);

            if (job.date) {
                // Correct logic: RemoteOK gives ISO string.
                // Convert to SECONDS (floor of ms / 1000)
                const date = new Date(job.date);
                if (!isNaN(date.getTime())) {
                     const seconds = Math.floor(date.getTime() / 1000);
                     const url = `https://remoteok.com/l/${job.id}`;
                     updates.push(`UPDATE jobs SET post_date = ${seconds} WHERE source_url = '${url.replace(/'/g, "''")}';`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('RemoteOK error:', e);
  }

  console.log(`Generated ${updates.length} updates.`);
  fs.writeFileSync('fix_dates_final.sql', updates.join('\n'));
}

main();


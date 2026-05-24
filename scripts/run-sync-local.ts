
// Set NODE_ENV to development to ensure getCloudflareContext works
process.env.NODE_ENV = 'development';

import { syncJobs } from '../src/lib/job-sync';

async function main() {
  console.log('🚀 Starting local job sync...');
  
  try {
    const result = await syncJobs({
      updateExisting: true,
      addNew: true,
      onLog: (message, level) => {
        const prefix = level === 'error' ? '❌ ' : level === 'success' ? '✅ ' : level === 'warning' ? '⚠️ ' : 'ℹ️ ';
        console.log(`${prefix}${message}`);
      }
    });
    
    console.log('✨ Sync finished successfully!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main();

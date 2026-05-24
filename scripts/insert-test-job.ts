import { getPlatformProxy } from 'wrangler'
import { getDb } from '../src/db/db'
import { jobs } from '../src/db/schema'

async function main() {
  const { env } = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  })
  
  const db = getDb(env.DB)
  
  console.log('Inserting test job...')
  await db.insert(jobs).values({
    title: 'Senior Product Manager',
    company: 'Test Corp',
    description: 'Manage the product lifecycle.',
    sourceUrl: 'https://example.com',
    sourceName: 'Manual',
    categoryId: 2, // Intentionally wrong category (Project Management)
    remoteType: 'fully_remote',
    postDate: new Date(),
    updatedAt: new Date(),
    createdAt: new Date()
  })
  
  console.log('Test job inserted.')
  process.exit(0)
}

main()

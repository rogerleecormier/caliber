import { getPlatformProxy } from 'wrangler'
import { getDb } from '../src/db/db'
import { categories } from '../src/db/schema'

async function main() {
  console.log('Initializing DB connection...')
  const { env } = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  })
  
  const db = getDb(env.DB)

  console.log('Adding Product Management category...')

  try {
    await db.insert(categories).values({
      id: 9,
      name: 'Product Management',
      slug: 'product-management',
      description: 'Product managers, product owners, and product leadership roles',
    })
    console.log('Successfully added Product Management category (ID: 9)')
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      console.log('Category already exists, skipping.')
    } else {
      console.error('Error adding category:', error)
      process.exit(1)
    }
  }
  
  process.exit(0)
}

main()

import { migrate } from 'drizzle-orm/d1/migrator'
import { getDbFromContext } from './db'

async function runMigrations() {
    try {
        const db = await getDbFromContext({})
        console.log('Running migrations...')
        await migrate(db, { migrationsFolder: './drizzle' })
        console.log('Migrations completed!')
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }
}

runMigrations()

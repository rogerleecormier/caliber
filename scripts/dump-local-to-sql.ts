import { getDb, schema } from '../src/db/db';
import { getPlatformProxy } from 'wrangler';
import fs from 'fs/promises';
import path from 'path';

async function dumpLocalDbToSql() {
  console.log('📦 Dumping local database to SQL...');
  
  const platform = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  });
  
  if (!platform.env.DB) {
      throw new Error('❌ DB binding not found in platform proxy');
  }

  const db = getDb(platform.env.DB as unknown as D1Database);
  
  const potential = await db.select().from(schema.potentialCompanies);
  const discovered = await db.select().from(schema.discoveredCompanies);
  
  console.log(`ℹ️  Found ${potential.length} potential and ${discovered.length} discovered companies locally.`);

  let sql = '';

  // Potential Companies
  if (potential.length > 0) {
    sql += '-- Potential Companies\n';
    for (const company of potential) {
      // Use INSERT OR IGNORE to handle duplicates
      sql += `INSERT OR IGNORE INTO potential_companies (id, slug, status, check_count, added_at) VALUES ('${company.id}', '${company.slug}', '${company.status || 'pending'}', ${company.checkCount || 0}, unixepoch());\n`;
    }
  }

  // Discovered Companies
  if (discovered.length > 0) {
    sql += '\n-- Discovered Companies\n';
    for (const company of discovered) {
      const safeName = (company.name || company.slug).replace(/'/g, "''"); // Escape single quotes
      sql += `INSERT OR IGNORE INTO discovered_companies (slug, name, source, status, job_count, created_at, updated_at) VALUES ('${company.slug}', '${safeName}', '${company.source}', '${company.status || 'new'}', 0, unixepoch(), unixepoch());\n`;
    }
  }

  const outputPath = path.join(process.cwd(), 'scripts', 'seed-full-remote.sql');
  await fs.writeFile(outputPath, sql);
  
  console.log(`✅ Generated full SQL dump at: ${outputPath}`);
  console.log(`👉 Run it with: npx wrangler d1 execute DB --remote --file=./scripts/seed-full-remote.sql`);
  
  await platform.dispose();
}

dumpLocalDbToSql().catch(console.error);

import { EXPANDED_COMPANIES, DISCOVERED_COMPANIES } from './seed-expanded';
import fs from 'fs/promises';
import path from 'path';

async function generateSql() {
  console.log('📝 Generating SQL seed file...');
  
  let sql = '';

  // Potential Companies
  if (EXPANDED_COMPANIES.length > 0) {
    sql += '-- Potential Companies\n';
    for (const slug of EXPANDED_COMPANIES) {
      // Use INSERT OR IGNORE to handle duplicates
      sql += `INSERT OR IGNORE INTO potential_companies (id, slug, status, check_count, added_at) VALUES ('${crypto.randomUUID()}', '${slug}', 'pending', 0, unixepoch());\n`;
    }
  }

  // Discovered Companies
  if (DISCOVERED_COMPANIES.length > 0) {
    sql += '\n-- Discovered Companies\n';
    for (const company of DISCOVERED_COMPANIES) {
      const safeName = company.name.replace(/'/g, "''"); // Escape single quotes
      sql += `INSERT OR IGNORE INTO discovered_companies (slug, name, source, status, job_count, created_at, updated_at) VALUES ('${company.slug}', '${safeName}', '${company.source}', 'new', 0, unixepoch(), unixepoch());\n`;
    }
  }

  const outputPath = path.join(process.cwd(), 'scripts', 'seed-expanded.sql');
  await fs.writeFile(outputPath, sql);
  
  console.log(`✅ Generated SQL file at: ${outputPath}`);
  console.log(`👉 Run it with: npx wrangler d1 execute DB --remote --file=./scripts/seed-expanded.sql`);
}

generateSql().catch(console.error);

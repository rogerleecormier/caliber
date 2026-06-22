#!/usr/bin/env node
/**
 * Seed the Vectorize index with embeddings for all canonical_jobs that
 * don't yet have a vector_id. Calls the /api/admin/seed-vectors endpoint
 * on the local dev server (default) or production (pass --prod flag).
 *
 * Usage:
 *   npm run seed:vectors           # hits http://localhost:3003
 *   npm run seed:vectors -- --prod # hits https://caliber.rcormier.dev
 */

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const baseUrl = isProd
  ? 'https://caliber.rcormier.dev'
  : 'http://localhost:3003';

const endpoint = `${baseUrl}/api/admin/seed-vectors`;

console.log(`[seed-vectors] Seeding vector index via ${endpoint}`);
console.log('[seed-vectors] This may take several minutes for large job catalogs...\n');

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await res.json();

  if (!res.ok || !body.success) {
    console.error('[seed-vectors] Failed:', body.error ?? res.statusText);
    process.exit(1);
  }

  console.log('[seed-vectors] Done!');
  console.log(`  Total jobs scanned : ${body.total}`);
  console.log(`  Successfully seeded: ${body.seeded}`);
  console.log(`  Failed             : ${body.failed}`);
} catch (err) {
  console.error('[seed-vectors] Network error:', err.message);
  console.error('  Make sure the dev server is running (npm run dev) or pass --prod');
  process.exit(1);
}

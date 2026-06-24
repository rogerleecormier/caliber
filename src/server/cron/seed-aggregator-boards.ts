const REMOTEOK_TAGS = [
  'dev', 'engineer', 'devops', 'design', 'marketing',
  'developer', 'frontend', 'backend', 'fullstack',
  'product', 'project', 'data', 'support',
  'program', 'cloud', 'sysadmin', 'customer_success',
] as const;

const HIMALAYAS_OFFSETS = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200] as const;

const JOBICY_INDUSTRIES = [
  'dev', 'marketing', 'design-multimedia', 'business',
  'engineering', 'hr', 'copywriting', 'data-science',
  'accounting-finance', 'management', 'technical-support', 'seo',
] as const;

const SEARCH_KEYWORDS = [
  'software engineer',
  'product manager',
  'data engineer',
  'devops engineer',
  'frontend engineer',
  'backend engineer',
  'fullstack engineer',
  'machine learning engineer',
  'engineering manager',
  'designer',
] as const;

function tokenize(keyword: string): string {
  return keyword.replace(/\s+/g, '+');
}

interface SeedBoard {
  ats: string;
  token: string;
  companyName: string;
  tier: string;
}

function buildSeedBoards(): SeedBoard[] {
  const boards: SeedBoard[] = [];

  for (const tag of REMOTEOK_TAGS) {
    boards.push({ ats: 'remoteok', token: tag, companyName: `RemoteOK [${tag}]`, tier: 'tier2' });
  }

  for (const offset of HIMALAYAS_OFFSETS) {
    boards.push({ ats: 'himalayas', token: String(offset), companyName: `Himalayas [page ${offset}]`, tier: 'tier2' });
  }

  for (const industry of JOBICY_INDUSTRIES) {
    boards.push({ ats: 'jobicy', token: industry, companyName: `Jobicy [${industry}]`, tier: 'tier3' });
  }

  for (const keyword of SEARCH_KEYWORDS) {
    const token = tokenize(keyword);
    boards.push({ ats: 'adzuna',   token, companyName: `Adzuna: ${keyword}`,   tier: 'tier3' });
    boards.push({ ats: 'jooble',   token, companyName: `Jooble: ${keyword}`,   tier: 'tier3' });
    boards.push({ ats: 'remotive', token, companyName: `Remotive: ${keyword}`, tier: 'tier3' });
  }

  return boards;
}

export async function seedAggregatorBoards(env: { DB: D1Database }): Promise<void> {
  if (!env.DB) return;

  // Check if already seeded — count virtual board rows
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM boards WHERE discovery_phase = 'aggregator_seed'`
  ).all<{ cnt: number }>();

  if (results?.[0]?.cnt > 0) return;

  const boards = buildSeedBoards();
  const now = new Date().toISOString();
  const statements = boards.map((b) =>
    env.DB.prepare(
      `INSERT INTO boards (id, ats, token, company_name, crawl_frequency_tier, is_active,
        discovered_at, created_at, last_discovered_at, discovery_phase, discovery_confidence, validated)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'aggregator_seed', 1.0, 1)
      ON CONFLICT(ats, token) DO NOTHING`
    ).bind(crypto.randomUUID(), b.ats, b.token, b.companyName, b.tier, now, now, now)
  );

  // D1 batch limit is 100 statements; chunk if needed
  const chunkSize = 100;
  for (let i = 0; i < statements.length; i += chunkSize) {
    await env.DB.batch(statements.slice(i, i + chunkSize));
  }

  console.log(`[seed-aggregator-boards] Seeded ${boards.length} virtual boards`);
}

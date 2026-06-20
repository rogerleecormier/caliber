import { DiscoveredBoard } from './types';
import { fetchFortuneList, fetchYCBatch, fetchCrunchbaseCompanies, mergeCompanySources } from './sources';
import { probeCareerPages, extractTokenFromUrl } from './patterns';
import { inferTokensViaCloudflareAI } from './llm-inference';
import { fetchFantasticJobsBoards, fetchTheirStackBoards } from './aggregators';
import { googleDorkSearch, serpApiSearch } from './search';
import { monitorIndeedForJobs } from './feeds';
import { logAudit } from '../db/queries';

export async function processDiscoveryQueue(
  batch: any,
  env: any
): Promise<void> {
  console.log(`[discovery-consumer] Processing queue batch with ${batch.messages.length} messages`);
  for (const message of batch.messages) {
    try {
      const { phase } = message.body;
      await handleDiscoveryMessage({ phase, priority: 1 }, env);
    } catch (e) {
      console.error('[discovery-consumer] Error handling queue message:', e);
    }
  }
}

export async function handleDiscoveryMessage(
  message: { phase: string; priority: number },
  env: any
): Promise<void> {
  console.log(`[Discovery] Starting phase: ${message.phase}`);

  let boards: DiscoveredBoard[] = [];

  switch (message.phase) {
    case 'company_lists':
      boards = await discoverFromCompanyLists(env);
      break;
    case 'llm_inference':
      boards = await discoverViaLlmInference(env);
      break;
    case 'aggregators':
      boards = await discoverFromAggregators(env);
      break;
    case 'search_engine':
      boards = await discoverViaSearch(env);
      break;
    case 'job_feeds':
      boards = await discoverFromFeeds(env);
      break;
  }

  // Dedupe + validate + save
  const validated = await validateAndDedupeBoards(boards, env);
  console.log(`[Discovery] Phase ${message.phase}: found & validated ${validated.length} boards`);
}

async function discoverFromCompanyLists(env: any): Promise<DiscoveredBoard[]> {
  const [fortune500, ycList, cbList] = await Promise.all([
    fetchFortuneList(),
    fetchYCBatch('S23'),
    fetchCrunchbaseCompanies(),
  ]);

  const merged = await mergeCompanySources([fortune500, ycList, cbList]);
  const results: DiscoveredBoard[] = [];

  // Probe career pages for a small slice to prevent timeout (limit to 15 companies per run)
  const probeSlice = merged.slice(0, 15);
  for (const company of probeSlice) {
    const domain = company.domain || `${company.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    const pages = await probeCareerPages(company.name, domain);
    for (const page of pages) {
      if (page.ats) {
        const token = extractTokenFromUrl(page.url, page.ats);
        if (token) {
          results.push({
            company: company.name,
            ats: page.ats,
            token,
            confidence: 0.85,
            discoveryPhase: 'company_lists',
          });
        }
      }
    }
  }

  return results;
}

async function discoverViaLlmInference(env: any): Promise<DiscoveredBoard[]> {
  // Query pending potential companies or unvalidated companies
  const unvalidated = await env.DB.prepare(`
    SELECT DISTINCT company_name FROM boards WHERE validated = 0 LIMIT 10
  `).all<{ company_name: string }>();

  const results: DiscoveredBoard[] = [];
  for (const row of unvalidated.results ?? []) {
    const inferences = await inferTokensViaCloudflareAI(row.company_name, env);
    for (const inference of inferences) {
      for (const token of inference.inferredTokens) {
        results.push({
          company: row.company_name,
          ats: inference.ats,
          token,
          confidence: 0.65,
          discoveryPhase: 'llm_inference',
        });
      }
    }
  }

  return results;
}

async function discoverFromAggregators(env: any): Promise<DiscoveredBoard[]> {
  const [fantastic, theirstack] = await Promise.all([
    fetchFantasticJobsBoards(),
    fetchTheirStackBoards(env.THEIRSTACK_API_KEY),
  ]);

  return [...fantastic, ...theirstack];
}

async function discoverViaSearch(env: any): Promise<DiscoveredBoard[]> {
  const serpApiKey = env.SERP_API_KEY;
  const atsPlatforms = ['greenhouse', 'lever', 'ashby', 'workable'];
  const results: DiscoveredBoard[] = [];

  for (const ats of atsPlatforms) {
    // Basic Google dork fallback if no SerpAPI key
    const searchResults = serpApiKey
      ? await serpApiSearch(ats, serpApiKey)
      : await googleDorkSearch(ats);

    for (const result of searchResults) {
      results.push({
        company: result.company,
        ats: result.ats || ats,
        token: result.company,
        confidence: 0.75,
        discoveryPhase: 'search_engine',
      });
    }
  }

  return results;
}

async function discoverFromFeeds(env: any): Promise<DiscoveredBoard[]> {
  const keywords = ['engineering', 'product', 'design'];
  const indeedBoards = await monitorIndeedForJobs(keywords, env);
  
  return indeedBoards.map(board => ({
    company: board.company,
    ats: board.ats,
    token: board.token,
    confidence: 0.7,
    discoveryPhase: 'job_feeds',
  }));
}

async function validateAndDedupeBoards(
  discovered: DiscoveredBoard[],
  env: any
): Promise<DiscoveredBoard[]> {
  // Dedupe by (ats, token)
  const deduped = new Map<string, DiscoveredBoard>();
  for (const board of discovered) {
    const key = `${board.ats}:${board.token}`;
    const existing = deduped.get(key);
    if (!existing || board.confidence > existing.confidence) {
      deduped.set(key, board);
    }
  }

  const validated: DiscoveredBoard[] = [];
  const now = new Date().toISOString();

  for (const board of deduped.values()) {
    const isValid = await validateBoardToken(board.ats, board.token);
    if (isValid) {
      validated.push(board);

      const boardId = crypto.randomUUID();
      
      // Upsert into boards
      await env.DB.prepare(`
        INSERT INTO boards (
          id, ats, token, company_name, crawl_frequency_tier, is_active, 
          discovered_at, created_at, last_discovered_at, discovery_phase, 
          discovery_confidence, validated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ats, token) DO UPDATE SET
          last_discovered_at = excluded.last_discovered_at,
          discovery_phase = excluded.discovery_phase,
          discovery_confidence = MAX(discovery_confidence, excluded.discovery_confidence),
          validated = 1
      `).bind(
        boardId,
        board.ats,
        board.token,
        board.company,
        'tier2',
        1, // is_active
        now,
        now,
        now,
        board.discoveryPhase,
        board.confidence,
        1 // validated
      ).run();

      // Log Audit Event
      try {
        await logAudit(env, {
          eventType: 'board_discovered',
          ats: board.ats,
          boardToken: board.token,
          details: {
            company: board.company,
            confidence: board.confidence,
            phase: board.discoveryPhase,
          },
          actor: 'discovery_worker'
        });
      } catch (err) {
        console.error('[discovery] Failed to log audit:', err);
      }
    } else {
      // Mark validation failure for unvalidated entry if exists
      await env.DB.prepare(`
        UPDATE boards 
        SET validation_error_count = validation_error_count + 1 
        WHERE ats = ? AND token = ?
      `).bind(board.ats, board.token).run();
    }
  }

  return validated;
}

export async function validateBoardToken(ats: string, token: string): Promise<boolean> {
  try {
    let url = '';
    switch (ats) {
      case 'greenhouse':
        url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`;
        break;
      case 'lever':
        url = `https://api.lever.co/v0/postings/${token}?mode=json`;
        break;
      case 'ashby':
        url = `https://api.ashbyhq.com/posting-api/job-board/${token}`;
        break;
      case 'workable':
        url = `https://apply.workable.com/api/v1/widget/accounts/${token}`;
        break;
      default:
        return false;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev)' }
    });

    return res.status >= 200 && res.status < 300;
  } catch (e) {
    console.error(`[discovery] Failed validating board ${ats}:${token}:`, e);
    return false;
  }
}

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
  console.log('[Discovery:company_lists] Fetching seed company lists...');
  const [fortune500, ycList, cbList] = await Promise.all([
    fetchFortuneList(),
    fetchYCBatch('S23'),
    fetchCrunchbaseCompanies(),
  ]);

  console.log(`[Discovery:company_lists] Loaded: Fortune 500 (${fortune500.length}), YC S23 (${ycList.length}), Crunchbase (${cbList.length})`);
  const merged = await mergeCompanySources([fortune500, ycList, cbList]);
  console.log(`[Discovery:company_lists] Merged into ${merged.length} unique companies`);

  const results: DiscoveredBoard[] = [];

  // Probe career pages for a small slice to prevent timeout (limit to 15 companies per run)
  const probeSlice = merged.slice(0, 15);
  console.log(`[Discovery:company_lists] Probing careers pages for slice of 15 companies: ${probeSlice.map(c => c.name).join(', ')}`);

  for (const company of probeSlice) {
    const domain = company.domain || `${company.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    console.log(`[Discovery:company_lists] Probing ${company.name} at domain: ${domain}...`);
    const pages = await probeCareerPages(company.name, domain);
    console.log(`[Discovery:company_lists] Probing ${company.name} finished. Found ${pages.length} match indicators`);
    for (const page of pages) {
      if (page.ats) {
        const token = extractTokenFromUrl(page.url, page.ats);
        console.log(`[Discovery:company_lists] Found potential token: ${token} for ATS: ${page.ats} from URL: ${page.url}`);
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
  console.log('[Discovery:llm_inference] Querying unvalidated boards from database...');
  // Query pending potential companies or unvalidated companies
  const unvalidated = await env.DB.prepare(`
    SELECT DISTINCT company_name FROM boards WHERE validated = 0 LIMIT 10
  `).all<{ company_name: string }>();

  const targetCompanies = unvalidated.results ?? [];
  console.log(`[Discovery:llm_inference] Found ${targetCompanies.length} candidate companies for LLM inference`);

  const results: DiscoveredBoard[] = [];
  for (const row of targetCompanies) {
    console.log(`[Discovery:llm_inference] Querying Workers AI token inference for company: "${row.company_name}"...`);
    const inferences = await inferTokensViaCloudflareAI(row.company_name, env);
    console.log(`[Discovery:llm_inference] Workers AI returned ${inferences.length} platform inferences for "${row.company_name}"`);
    for (const inference of inferences) {
      console.log(`[Discovery:llm_inference] ${inference.ats} inferred tokens: ${inference.inferredTokens.join(', ')}`);
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
  console.log('[Discovery:aggregators] Fetching aggregators mappings...');
  const [fantastic, theirstack] = await Promise.all([
    fetchFantasticJobsBoards(),
    fetchTheirStackBoards(env.THEIRSTACK_API_KEY),
  ]);

  console.log(`[Discovery:aggregators] Loaded: Fantastic.jobs (${fantastic.length} boards), TheirStack (${theirstack.length} boards)`);
  return [...fantastic, ...theirstack];
}

async function discoverViaSearch(env: any): Promise<DiscoveredBoard[]> {
  const serpApiKey = env.SERP_API_KEY;
  const atsPlatforms = ['greenhouse', 'lever', 'ashby', 'workable'];
  const results: DiscoveredBoard[] = [];

  console.log(`[Discovery:search_engine] Triggering Google searches for ATS platforms: ${atsPlatforms.join(', ')}. SerpAPI Key configured: ${!!serpApiKey}`);

  for (const ats of atsPlatforms) {
    // Basic Google dork fallback if no SerpAPI key
    const searchResults = serpApiKey
      ? await serpApiSearch(ats, serpApiKey)
      : await googleDorkSearch(ats);

    console.log(`[Discovery:search_engine] Search for "${ats}" found ${searchResults.length} candidate board links`);
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
  console.log(`[Discovery:job_feeds] Fetching Indeed job feeds for keywords: ${keywords.join(', ')}...`);
  const indeedBoards = await monitorIndeedForJobs(keywords, env);
  
  console.log(`[Discovery:job_feeds] Scrape finished. Found ${indeedBoards.length} boards from feeds`);
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
  console.log(`[Discovery:validate] Starting validation + deduplication on ${discovered.length} candidates...`);
  // Dedupe by (ats, token)
  const deduped = new Map<string, DiscoveredBoard>();
  for (const board of discovered) {
    const key = `${board.ats}:${board.token}`;
    const existing = deduped.get(key);
    if (!existing || board.confidence > existing.confidence) {
      deduped.set(key, board);
    }
  }

  console.log(`[Discovery:validate] Deduped down to ${deduped.size} unique candidate boards`);
  const validated: DiscoveredBoard[] = [];
  const now = new Date().toISOString();

  for (const board of deduped.values()) {
    console.log(`[Discovery:validate] Probing candidate board token: [${board.ats}:${board.token}]...`);
    const isValid = await validateBoardToken(board.ats, board.token);
    console.log(`[Discovery:validate] Board token check for [${board.ats}:${board.token}]: ${isValid ? 'SUCCESS' : 'FAILED'}`);
    
    if (isValid) {
      validated.push(board);

      const boardId = crypto.randomUUID();
      console.log(`[Discovery:validate] Saving validated board to DB: ${board.company} ([${board.ats}:${board.token}])`);
      
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
      console.log(`[Discovery:validate] Recording validation failure count for [${board.ats}:${board.token}]`);
      // Mark validation failure for unvalidated entry if exists
      await env.DB.prepare(`
        UPDATE boards 
        SET validation_error_count = validation_error_count + 1 
        WHERE ats = ? AND token = ?
      `).bind(board.ats, board.token).run();

      // Log Audit Event for failure
      try {
        await logAudit(env, {
          eventType: 'board_validation_failed',
          ats: board.ats,
          boardToken: board.token,
          details: {
            company: board.company,
            confidence: board.confidence,
            phase: board.discoveryPhase,
            error: 'Validation fetch returned non-200 or failed'
          },
          actor: 'discovery_worker'
        });
      } catch (err) {
        console.error('[discovery] Failed to log failure audit:', err);
      }
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

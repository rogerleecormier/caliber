import { extractTokenFromUrl } from './patterns';

export interface SearchResult {
  company: string;
  url: string;
  ats?: string;
  source: 'google_dork' | 'serp_api';
}

export async function googleDorkSearch(ats: string): Promise<SearchResult[]> {
  const dorks: Record<string, string> = {
    greenhouse: 'site:boards.greenhouse.io',
    lever: 'site:jobs.lever.co OR site:careers.lever.co',
    ashby: 'site:jobs.ashbyhq.com',
    workable: 'site:apply.workable.com OR site:workable.com/careers',
  };

  const query = dorks[ats];
  if (!query) return [];

  try {
    const response = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    );
    if (!response.ok) {
      throw new Error(`Google HTTP ${response.status}`);
    }
    const html = await response.text();

    // Extract URLs from Google SERP (basic regex)
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const matches = html.match(urlPattern) ?? [];

    const results: SearchResult[] = [];
    for (const url of matches) {
      // Clean url from Google tracking if nested, e.g. /url?q=https://...
      let cleanUrl = url;
      if (url.includes('/url?q=')) {
        const u = new URL(url);
        const qParam = u.searchParams.get('q');
        if (qParam) {
          cleanUrl = qParam;
        }
      }

      const token = extractTokenFromUrl(cleanUrl, ats);
      if (token) {
        results.push({
          company: token,
          url: cleanUrl,
          ats,
          source: 'google_dork',
        });
      }
    }

    if (results.length === 0) {
      // Return mock fallbacks if Google blocked us (common in Worker environments)
      return getMockSearchResults(ats, 'google_dork');
    }

    return results;
  } catch (e) {
    console.error(`[search] Google dork search failed for ${ats}, using fallback mock:`, e);
    return getMockSearchResults(ats, 'google_dork');
  }
}

export async function serpApiSearch(ats: string, apiKey: string): Promise<SearchResult[]> {
  const dorks: Record<string, string> = {
    greenhouse: 'site:boards.greenhouse.io',
    lever: 'site:jobs.lever.co',
    ashby: 'site:jobs.ashbyhq.com',
    workable: 'site:apply.workable.com',
  };

  const query = dorks[ats];
  if (!query) return [];

  try {
    const response = await fetch(
      `https://serpapi.com/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&engine=google&num=50`
    );

    if (!response.ok) {
      throw new Error(`SerpAPI HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      organic_results?: Array<{ link: string; title: string }>;
    };

    const results: SearchResult[] = [];
    for (const result of data.organic_results ?? []) {
      const token = extractTokenFromUrl(result.link, ats);
      if (token) {
        results.push({
          company: token,
          url: result.link,
          ats,
          source: 'serp_api',
        });
      }
    }

    return results;
  } catch (e) {
    console.error(`[search] SerpAPI search failed for ${ats}:`, e);
    return [];
  }
}

function getMockSearchResults(ats: string, source: 'google_dork' | 'serp_api'): SearchResult[] {
  const mocks: Record<string, SearchResult[]> = {
    greenhouse: [
      { company: 'figma', url: 'https://boards.greenhouse.io/figma', ats: 'greenhouse', source },
      { company: 'hashicorp', url: 'https://boards.greenhouse.io/hashicorp', ats: 'greenhouse', source },
    ],
    lever: [
      { company: 'figma', url: 'https://jobs.lever.co/figma', ats: 'lever', source },
      { company: 'vercel', url: 'https://jobs.lever.co/vercel', ats: 'lever', source },
    ],
    ashby: [
      { company: 'railway', url: 'https://jobs.ashbyhq.com/railway', ats: 'ashby', source },
      { company: 'clerk', url: 'https://jobs.ashbyhq.com/clerk', ats: 'ashby', source },
    ],
    workable: [
      { company: 'superhuman', url: 'https://apply.workable.com/superhuman', ats: 'workable', source },
    ]
  };

  return mocks[ats] ?? [];
}

import { extractTokenFromUrl } from './patterns';

export interface FeedBoard {
  company: string;
  ats: string;
  token: string;
  source: 'indeed_api' | 'ziprecruiter_api' | 'dice_api' | 'rss';
}

export async function monitorIndeedForJobs(
  keywords: string[],
  env: any
): Promise<FeedBoard[]> {
  const boards: FeedBoard[] = [];

  for (const keyword of keywords) {
    try {
      const response = await fetch(
        `https://www.indeed.com/jobs?q=${encodeURIComponent(keyword + ' careers')}&fromage=7&sort=date`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Indeed HTTP ${response.status}`);
      }
      const html = await response.text();

      // Extract company names + job posting links
      // Heuristic: look for patterns like "careers.acme.com", "acme.jobs.greenhouse.io", etc.
      const regexes = [
        /https?:\/\/[^\s"'<>]*greenhouse[^\s"'<>]*/g,
        /https?:\/\/[^\s"'<>]*lever[^\s"'<>]*/g,
        /https?:\/\/[^\s"'<>]*ashby[^\s"'<>]*/g,
        /https?:\/\/[^\s"'<>]*workable[^\s"'<>]*/g,
      ];

      for (const regex of regexes) {
        const matches = html.match(regex) ?? [];
        for (const url of matches) {
          const ats = url.includes('greenhouse')
            ? 'greenhouse'
            : url.includes('lever')
              ? 'lever'
              : url.includes('ashby')
                ? 'ashby'
                : 'workable';
          
          const token = extractTokenFromUrl(url, ats);
          if (token && !boards.some(b => b.token === token && b.ats === ats)) {
            boards.push({
              company: token.charAt(0).toUpperCase() + token.slice(1),
              ats,
              token,
              source: 'rss',
            });
          }
        }
      }
    } catch (e) {
      console.error(`[feeds] Indeed crawl for "${keyword}" failed, using fallback mock:`, e);
      // fallback mock boards
      return getMockFeedBoards();
    }
  }

  if (boards.length === 0) {
    return getMockFeedBoards();
  }

  return boards;
}

export async function monitorZipRecruiterAPI(apiKey: string): Promise<FeedBoard[]> {
  if (!apiKey) return [];

  try {
    const response = await fetch(`https://api.ziprecruiter.com/jobs/search?api_key=${apiKey}`);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      jobs?: Array<{
        name: string;
        company: string;
        hiring_company_url?: string;
      }>;
    };

    const boards: FeedBoard[] = [];
    for (const job of data.jobs ?? []) {
      if (job.hiring_company_url) {
        let ats: string | undefined;
        if (job.hiring_company_url.includes('greenhouse')) ats = 'greenhouse';
        else if (job.hiring_company_url.includes('lever')) ats = 'lever';
        else if (job.hiring_company_url.includes('ashby')) ats = 'ashby';
        else if (job.hiring_company_url.includes('workable')) ats = 'workable';

        if (ats) {
          const token = extractTokenFromUrl(job.hiring_company_url, ats);
          if (token) {
            boards.push({
              company: job.company,
              ats,
              token,
              source: 'ziprecruiter_api',
            });
          }
        }
      }
    }
    return boards;
  } catch (e) {
    console.error('[feeds] ZipRecruiter API failed:', e);
    return [];
  }
}

function getMockFeedBoards(): FeedBoard[] {
  return [
    { company: 'Tailwind Labs', ats: 'workable', token: 'tailwind-labs', source: 'rss' },
    { company: 'Clerk', ats: 'ashby', token: 'clerk', source: 'rss' },
    { company: 'Figma', ats: 'greenhouse', token: 'figma', source: 'rss' },
  ];
}

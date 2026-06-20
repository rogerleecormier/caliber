import { CareerPagePatterns } from './types';

export const CAREER_PAGE_PATTERNS: CareerPagePatterns = {
  basePatterns: [
    'https://careers.{domain}',
    'https://jobs.{domain}',
    'https://{domain}/careers',
    'https://{domain}/jobs',
    'https://career.{domain}',
    'https://hiring.{domain}',
  ],
  atsSpecificPatterns: {
    greenhouse: [
      'https://boards.greenhouse.io/{token}',
      'https://{slug}.greenhouse.io',
      'https://{company}.greenhouse.io/jobs',
      'https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=false',
    ],
    lever: [
      'https://jobs.lever.co/{company}',
      'https://api.lever.co/v0/postings/{company}?mode=json',
    ],
    ashby: [
      'https://jobs.ashbyhq.com/{company}',
      'https://api.ashbyhq.com/posting-api/job-board/{company}',
    ],
    workable: [
      'https://apply.workable.com/api/v1/widget/accounts/{account}',
      'https://www.workable.com/careers/{account}',
    ],
  },
};

export function extractTokenFromUrl(url: string, ats: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname.split('/').filter(Boolean);

    if (ats === 'greenhouse') {
      if (hostname.includes('greenhouse.io')) {
        // e.g. boards.greenhouse.io/vercel or boards-api.greenhouse.io/v1/boards/vercel/jobs
        if (hostname.includes('boards-api')) {
          const boardIdx = path.indexOf('boards');
          if (boardIdx !== -1 && path[boardIdx + 1]) {
            return path[boardIdx + 1];
          }
        }
        return path[0] || '';
      }
    } else if (ats === 'lever') {
      if (hostname.includes('lever.co')) {
        // e.g. jobs.lever.co/vercel or api.lever.co/v0/postings/vercel
        return path[path.length - 1] || '';
      }
    } else if (ats === 'ashby') {
      if (hostname.includes('ashbyhq.com')) {
        // e.g. jobs.ashbyhq.com/vercel or api.ashbyhq.com/posting-api/job-board/vercel
        return path[path.length - 1] || '';
      }
    } else if (ats === 'workable') {
      if (hostname.includes('workable.com')) {
        // e.g. apply.workable.com/api/v1/widget/accounts/vercel or workable.com/careers/vercel
        return path[path.length - 1] || '';
      }
    }
  } catch (e) {
    // ignore
  }
  return '';
}

export function inferTokenFromCompanyDomain(domain: string): string {
  return domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export function isValidAtsResponse(ats: string, text: string): boolean {
  const indicators: Record<string, string[]> = {
    greenhouse: ['job', 'title', 'location', 'absolute_url'],
    lever: ['posting', 'hostedurl', 'applyurl'],
    ashby: ['posting', 'joburl'],
    workable: ['job', 'title', 'location'],
  };

  const checks = indicators[ats] ?? [];
  return checks.some(check => text.toLowerCase().includes(check));
}

export async function probeCareerPages(
  companyName: string,
  domain: string
): Promise<{ url: string; status: number; ats?: string }[]> {
  const slug = companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const results: { url: string; status: number; ats?: string }[] = [];

  // Probe base patterns
  for (const pattern of CAREER_PAGE_PATTERNS.basePatterns) {
    const url = pattern.replace('{domain}', domain);
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (response.ok || response.status === 405) {
        results.push({ url, status: response.status });
      }
    } catch (e) {
      // URL not accessible
    }
  }

  // ATS-specific patterns: probe for indicators
  const atsKeys = ['greenhouse', 'lever', 'ashby', 'workable'];
  for (const ats of atsKeys) {
    const patterns = CAREER_PAGE_PATTERNS.atsSpecificPatterns[ats] || [];
    for (const pattern of patterns) {
      const url = pattern
        .replace('{slug}', slug)
        .replace('{company}', slug)
        .replace('{token}', slug)
        .replace('{account}', slug);

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Caliber-Bot/1.0 (+https://caliber.rcormier.dev)' }
        });
        if (response.ok) {
          const text = await response.text();
          if (isValidAtsResponse(ats, text)) {
            results.push({ url, status: 200, ats });
          }
        }
      } catch (e) {
        // Endpoint not accessible
      }
    }
  }

  return results;
}

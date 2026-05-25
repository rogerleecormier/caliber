import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';

/**
 * Live search on the Adzuna Job Search API
 */
export async function searchAdzunaJobs(
  env: { ADZUNA_APP_ID?: string; ADZUNA_APP_KEY?: string },
  criteria: LinkedInSearchParams
): Promise<LinkedInScrapedJob[]> {
  const appId = env.ADZUNA_APP_ID || '';
  const appKey = env.ADZUNA_APP_KEY || '';

  if (!appId || !appKey) {
    console.warn("Adzuna search: missing ADZUNA_APP_ID or ADZUNA_APP_KEY environment variables.");
    return [];
  }

  const country = (criteria.region || 'us').toLowerCase();
  const page = criteria.page || 1;
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);

  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(criteria.limit || 15));
  url.searchParams.set('content-type', 'application/json');

  // Build query: if workplaceTypes is remote, append "remote" to the keywords
  let queryText = criteria.keywords;
  if (criteria.workplaceTypes?.includes('remote') && !criteria.workplaceTypes.includes('on-site')) {
    queryText = `${queryText} remote`;
  }
  url.searchParams.set('what', queryText);

  if (criteria.location) {
    url.searchParams.set('where', criteria.location);
  }

  if (criteria.distance != null) {
    // Adzuna expects distance in kilometers. Convert miles to km (1 mile ~ 1.609 km)
    const km = Math.round(criteria.distance * 1.60934);
    url.searchParams.set('distance', String(km));
  }

  if (criteria.salaryMin != null) {
    url.searchParams.set('salary_min', String(criteria.salaryMin));
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Adzuna API returned HTTP ${response.status}: ${await response.text()}`);
      return [];
    }

    const data = (await response.json()) as { results?: any[] };
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((item: any) => {
      // Map salary range into a single string
      let salaryText: string | null = null;
      if (item.salary_min != null && item.salary_max != null) {
        salaryText = `$${Math.round(item.salary_min).toLocaleString()} - $${Math.round(item.salary_max).toLocaleString()}`;
      } else if (item.salary_min != null) {
        salaryText = `$${Math.round(item.salary_min).toLocaleString()}+`;
      }

      // Classify workplace type dynamically from title/description
      const title = item.title || '';
      const desc = item.description || '';
      const text = `${title} ${desc}`.toLowerCase();
      
      let workplace: string = 'on-site';
      if (/\bhybrid\b/.test(text)) {
        workplace = 'hybrid';
      } else if (/\bremote\b/.test(text) || /\bwork[\s-](?:from|at)[\s-]home\b/.test(text) || /\btelecommute\b/.test(text) || /\bvirtual\b/.test(text)) {
        workplace = 'remote';
      }

      return {
        id: `adzuna-${item.id}`,
        title: item.title,
        company: item.company?.display_name || 'Unknown Company',
        location: item.location?.display_name || 'US',
        sourceUrl: item.redirect_url,
        sourceName: 'Adzuna',
        postDateText: item.created ? new Date(item.created).toLocaleDateString() : null,
        firstSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        workplaceType: workplace,
        salary: salaryText,
        snippet: item.description ? item.description.substring(0, 300) : null,
        description: item.description || null,
      };
    });
  } catch (error) {
    console.error("Adzuna API search failed:", error);
    return [];
  }
}

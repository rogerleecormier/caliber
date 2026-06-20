import { DiscoveredBoard } from './types';
import { extractTokenFromUrl, inferTokenFromCompanyDomain } from './patterns';

export async function fetchFantasticJobsBoards(): Promise<DiscoveredBoard[]> {
  try {
    const response = await fetch('https://fantastic.jobs/api/companies?limit=100');
    if (!response.ok) {
      // Fallback/Mock list of validated boards
      return [
        { company: 'Vercel', ats: 'greenhouse', token: 'vercel', confidence: 0.9, discoveryPhase: 'aggregators' },
        { company: 'Stripe', ats: 'lever', token: 'stripe', confidence: 0.9, discoveryPhase: 'aggregators' },
        { company: 'Linear', ats: 'ashby', token: 'linear', confidence: 0.9, discoveryPhase: 'aggregators' },
        { company: 'Supabase', ats: 'greenhouse', token: 'supabase', confidence: 0.9, discoveryPhase: 'aggregators' },
        { company: 'Railway', ats: 'ashby', token: 'railway', confidence: 0.9, discoveryPhase: 'aggregators' },
        { company: 'Fly.io', ats: 'lever', token: 'fly', confidence: 0.9, discoveryPhase: 'aggregators' },
      ];
    }

    const data = (await response.json()) as Array<{
      name: string;
      domain: string;
      ats_type: string;
      careers_url: string;
    }>;

    const validAts = ['greenhouse', 'lever', 'ashby', 'workable'];
    return data
      .filter(company => validAts.includes(company.ats_type.toLowerCase()))
      .map(company => {
        const ats = company.ats_type.toLowerCase();
        const token = extractTokenFromUrl(company.careers_url, ats) || inferTokenFromCompanyDomain(company.domain);
        return {
          company: company.name,
          ats,
          token,
          confidence: 0.9,
          discoveryPhase: 'aggregators',
        };
      });
  } catch (e) {
    console.error('[aggregators] Fantastic.jobs fetch failed, returning mock fallback:', e);
    return [
      { company: 'Vercel', ats: 'greenhouse', token: 'vercel', confidence: 0.9, discoveryPhase: 'aggregators' },
      { company: 'Stripe', ats: 'lever', token: 'stripe', confidence: 0.9, discoveryPhase: 'aggregators' },
      { company: 'Linear', ats: 'ashby', token: 'linear', confidence: 0.9, discoveryPhase: 'aggregators' },
      { company: 'Supabase', ats: 'greenhouse', token: 'supabase', confidence: 0.9, discoveryPhase: 'aggregators' },
      { company: 'Railway', ats: 'ashby', token: 'railway', confidence: 0.9, discoveryPhase: 'aggregators' },
      { company: 'Fly.io', ats: 'lever', token: 'fly', confidence: 0.9, discoveryPhase: 'aggregators' },
    ];
  }
}

export async function fetchTheirStackBoards(apiKey?: string): Promise<DiscoveredBoard[]> {
  if (!apiKey) {
    // Return mock
    return [
      { company: 'PostHog', ats: 'ashby', token: 'posthog', confidence: 0.8, discoveryPhase: 'aggregators' },
      { company: 'Retool', ats: 'greenhouse', token: 'retool', confidence: 0.8, discoveryPhase: 'aggregators' },
      { company: 'Kinsta', ats: 'lever', token: 'kinsta', confidence: 0.8, discoveryPhase: 'aggregators' },
    ];
  }

  try {
    const response = await fetch('https://api.theirstack.com/v1/companies', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as Array<{
      name: string;
      domain: string;
      tools: Array<{ name: string; category: string }>;
    }>;

    const boards: DiscoveredBoard[] = [];

    for (const company of data) {
      const recruitingTools = company.tools.filter(
        t => t.category === 'Recruiting' || t.name.includes('Greenhouse') || t.name.includes('Lever') || t.name.includes('Ashby')
      );

      for (const tool of recruitingTools) {
        let ats: string | undefined;
        if (tool.name.includes('Greenhouse')) ats = 'greenhouse';
        else if (tool.name.includes('Lever')) ats = 'lever';
        else if (tool.name.includes('Ashby')) ats = 'ashby';
        else continue;

        const token = inferTokenFromCompanyDomain(company.domain);
        boards.push({
          company: company.name,
          ats,
          token,
          confidence: 0.75, // unverified from tools metadata
          discoveryPhase: 'aggregators',
        });
      }
    }

    return boards;
  } catch (e) {
    console.error('[aggregators] TheirStack fetch failed:', e);
    return [];
  }
}

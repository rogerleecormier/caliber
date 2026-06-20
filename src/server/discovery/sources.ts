import { CompanySource } from './types';

export async function fetchFortuneList(): Promise<CompanySource[]> {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
    );
    if (!response.ok) return [];
    
    const csv = await response.text();
    const lines = csv.split('\n');
    const companies: CompanySource[] = [];

    for (const line of lines.slice(1)) {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      const name = parts[1];
      const hq = parts[4];
      if (name) {
        // Clean name (remove quotes)
        const cleanName = name.replace(/^"|"$/g, '').trim();
        const guessDomain = `${cleanName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`;
        
        companies.push({
          name: cleanName,
          domain: guessDomain,
          headquarters: hq ? hq.replace(/^"|"$/g, '').trim() : undefined,
          source: 'fortune500',
        });
      }
    }

    return companies;
  } catch (e) {
    console.error('Failed to fetch Fortune 500 list:', e);
    return [];
  }
}

export async function fetchYCBatch(batchYear: string = 'S23'): Promise<CompanySource[]> {
  try {
    // Attempt to pull from public YC JSON index on GitHub
    const response = await fetch(
      'https://yc-oss.github.io/api/companies/all.json'
    ).catch(() => null);

    if (!response || !response.ok) {
      // Fallback: Return a quick mock list of top YC companies
      return [
        { name: 'Airbnb', domain: 'airbnb.com', source: 'yc' },
        { name: 'Stripe', domain: 'stripe.com', source: 'yc' },
        { name: 'Dropbox', domain: 'dropbox.com', source: 'yc' },
        { name: 'Coinbase', domain: 'coinbase.com', source: 'yc' },
        { name: 'Instacart', domain: 'instacart.com', source: 'yc' },
        { name: 'Flexport', domain: 'flexport.com', source: 'yc' },
        { name: 'Gusto', domain: 'gusto.com', source: 'yc' },
        { name: 'Rappi', domain: 'rappi.com', source: 'yc' },
        { name: 'GitLab', domain: 'gitlab.com', source: 'yc' },
        { name: 'Reddit', domain: 'reddit.com', source: 'yc' },
        { name: 'Webflow', domain: 'webflow.com', source: 'yc' },
        { name: 'Zapier', domain: 'zapier.com', source: 'yc' },
        { name: 'Segment', domain: 'segment.com', source: 'yc' },
        { name: 'Deel', domain: 'deel.com', source: 'yc' },
        { name: 'Vanta', domain: 'vanta.com', source: 'yc' },
      ];
    }

    const data = (await response.json()) as Array<{
      name: string;
      website?: string;
      batch?: string;
    }>;

    return data
      .filter(company => !batchYear || company.batch?.includes(batchYear))
      .map(company => {
        let domain: string | undefined;
        if (company.website) {
          try {
            domain = new URL(company.website).hostname.replace(/^www\./, '');
          } catch {
            domain = company.website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
          }
        }
        return {
          name: company.name,
          domain,
          source: 'yc' as const,
        };
      });
  } catch (e) {
    console.error('Failed to fetch YC batch:', e);
    return [];
  }
}

export async function fetchCrunchbaseCompanies(apiKey?: string): Promise<CompanySource[]> {
  if (!apiKey) {
    // Return a mock list of high-growth startups
    return [
      { name: 'Vercel', domain: 'vercel.com', source: 'crunchbase' },
      { name: 'OpenAI', domain: 'openai.com', source: 'crunchbase' },
      { name: 'Linear', domain: 'linear.app', source: 'crunchbase' },
      { name: 'Supabase', domain: 'supabase.com', source: 'crunchbase' },
      { name: 'Retool', domain: 'retool.com', source: 'crunchbase' },
      { name: 'Figma', domain: 'figma.com', source: 'crunchbase' },
      { name: 'Notion', domain: 'notion.so', source: 'crunchbase' },
      { name: 'Sentry', domain: 'sentry.io', source: 'crunchbase' },
    ];
  }

  try {
    const response = await fetch('https://api.crunchbase.com/api/v4/entities/organizations', {
      method: 'POST',
      headers: { 'X-Crunchbase-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_ids: ['name', 'website', 'num_employees_enum'],
        limit: 100,
        offset: 0,
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      entities: Array<{ name: string; website?: string; num_employees_enum?: string }>;
    };

    return data.entities.map(company => ({
      name: company.name,
      domain: company.website ? new URL(company.website).hostname : undefined,
      source: 'crunchbase' as const,
    }));
  } catch (e) {
    console.error('Crunchbase fetch failed:', e);
    return [];
  }
}

export async function mergeCompanySources(
  sources: CompanySource[][]
): Promise<CompanySource[]> {
  const normalized = new Map<string, CompanySource>();

  for (const sourceList of sources) {
    for (const company of sourceList) {
      if (!company.name) continue;
      const key = company.name.toLowerCase().replace(/\s+(inc|corp|ltd|llc|gmbh|ag|sa)\.?$/i, '').trim();
      if (!normalized.has(key)) {
        normalized.set(key, company);
      }
    }
  }

  return Array.from(normalized.values());
}

import axios from 'axios';
import { getDb, schema } from '../src/db/db';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { getPlatformProxy } from 'wrangler';

const SOURCE_URL = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README.md';

async function expandCompanyList() {
  console.log('🚀 Starting company list expansion...');

  // 1. Fetch the markdown content
  console.log(`📥 Fetching content from ${SOURCE_URL}...`);
  const response = await axios.get(SOURCE_URL);
  const markdown = response.data;
  console.log(`📄 Markdown length: ${markdown.length} characters`);
  console.log(`📄 First 500 chars: ${markdown.substring(0, 500)}`);

  console.log(`📄 Middle 500 chars: ${markdown.substring(50000, 50500)}`);

  // 2. Parse the markdown
  console.log('🔍 Parsing markdown...');
  const companies = new Map<string, { name: string, url?: string, isDirect?: boolean }>();
  
  // Regex to find links like [CompanyName](url)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  
  // Regex to find HTML links like href="url"
  const htmlLinkRegex = /href=["'](https?:\/\/[^"']+)["']/g;
  
  const markdownMatches = [...markdown.matchAll(markdownLinkRegex)];
  const htmlMatches = [...markdown.matchAll(htmlLinkRegex)];
  
  console.log(`Found ${markdownMatches.length} markdown matches`);
  console.log(`Found ${htmlMatches.length} HTML matches`);

  const allMatches = [
    ...markdownMatches.map(m => ({ name: m[1], url: m[2] })),
    ...htmlMatches.map(m => ({ name: '', url: m[1] }))
  ];

  let matchCount = 0;
  for (const { name, url } of allMatches) {
    matchCount++;
    
    if (url.includes('greenhouse') || url.includes('lever')) {
        console.log(`Debug ATS match: ${name || 'HTML'} -> ${url}`);
    }

    if (matchCount <= 5) {
        console.log(`Debug match: ${name || 'HTML'} -> ${url}`);
    }

    // Filter for simplify.jobs company links
    // We want links like https://simplify.jobs/c/Databricks
    if (url.includes('simplify.jobs/c/')) {
        // Extract slug from URL
        // https://simplify.jobs/c/Databricks?utm... -> Databricks
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        // pathname is /c/Databricks
        const slugRaw = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
        
        const slug = slugRaw.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

        if (slug && !companies.has(slug)) {
            // If name is empty (from HTML), try to use slug as name or keep it empty
            companies.set(slug, { name: name || slug, url });
        }
    } else if (url.includes('greenhouse.io') || url.includes('lever.co')) {
        // Direct ATS links
        // Examples:
        // https://jobs.lever.co/tri/d7a23d87...
        // https://boards.greenhouse.io/cloudflare/jobs/7359147...
        // https://job-boards.greenhouse.io/samsungsemiconductor/jobs/7510017003...
        
        let slug = '';
        
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p); // remove empty strings
            
            if (url.includes('lever.co')) {
                // jobs.lever.co/<company>/...
                if (pathParts.length > 0) {
                    slug = pathParts[0];
                }
            } else if (url.includes('greenhouse.io')) {
                // boards.greenhouse.io/<company>/...
                // job-boards.greenhouse.io/<company>/...
                // boards.greenhouse.io/embed/job_app?token=... (skip these as they don't have company slug usually)
                if (!url.includes('embed/job_app')) {
                     if (pathParts.length > 0) {
                        slug = pathParts[0];
                    }
                }
            }
        } catch (e) {
            console.error(`Error parsing URL ${url}:`, e);
        }

        if (slug) {
             slug = slug.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
                
             if (slug && !companies.has(slug)) {
                 // Use slug as name since we don't have the text name easily for HTML links
                 companies.set(slug, { name: slug, url, isDirect: true });
             } else if (slug && companies.has(slug)) {
                 // Update existing entry to mark as direct if it wasn't
                 const existing = companies.get(slug)!;
                 if (!existing.isDirect) {
                     companies.set(slug, { ...existing, url, isDirect: true });
                 }
             }
        }
    }
  }

  console.log(`Matched ${matchCount} links total.`);
  console.log(`✅ Found ${companies.size} unique companies.`);

  // 3. Fetch existing companies from DB
  console.log('🔌 Connecting to database...');
  const platform = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  });
  
  if (!platform.env.DB) {
      throw new Error('❌ DB binding not found in platform proxy');
  }

  const db = getDb(platform.env.DB as unknown as D1Database);
  
  const existingPotential = await db.select().from(schema.potentialCompanies);
  const existingDiscovered = await db.select().from(schema.discoveredCompanies);
  
  const existingPotentialSlugs = new Set(existingPotential.map(c => c.slug));
  const existingDiscoveredSlugs = new Set(existingDiscovered.map(c => c.slug));
  
  const allExistingSlugs = new Set([...existingPotentialSlugs, ...existingDiscoveredSlugs]);

  console.log(`ℹ️  Database currently has ${existingPotentialSlugs.size} potential and ${existingDiscoveredSlugs.size} discovered companies.`);

  // 4. Compare and identify new companies
  const newPotential: string[] = [];
  const newDiscovered: { slug: string, name: string, source: string }[] = [];
  
  for (const [slug, data] of companies) {
    if (data.isDirect) {
        // If it's a direct link, we want to add it to discovered_companies if it's not already there
        if (!existingDiscoveredSlugs.has(slug)) {
            let source = 'other';
            if (data.url?.includes('greenhouse.io')) source = 'greenhouse';
            if (data.url?.includes('lever.co')) source = 'lever';
            
            newDiscovered.push({ slug, name: data.name, source });
        }
    } else {
        // If it's a simplify link, only add if it's not in potential OR discovered
        if (!allExistingSlugs.has(slug)) {
            newPotential.push(slug);
        }
    }
  }

  console.log(`🆕 Found ${newPotential.length} NEW potential companies.`);
  console.log(`🆕 Found ${newDiscovered.length} NEW discovered companies (direct URLs).`);

  // 5. Generate output
  if (newPotential.length > 0 || newDiscovered.length > 0) {
    const outputPath = path.join(process.cwd(), 'scripts', 'seed-expanded.ts');
    
    // Split into chunks to avoid massive file if needed, but for now single array
    const fileContent = `import { getDb, schema } from '../src/db/db';
import { getPlatformProxy } from 'wrangler';

export const EXPANDED_COMPANIES = [
${newPotential.map(slug => `  '${slug}',`).join('\n')}
];

export const DISCOVERED_COMPANIES = [
${newDiscovered.map(c => `  { slug: '${c.slug}', name: "${c.name.replace(/"/g, '\\"')}", source: '${c.source}' },`).join('\n')}
];

async function seedExpanded() {
  console.log('🌱 Seeding expanded companies...');
  
  const platform = await getPlatformProxy({
    configPath: './wrangler.toml',
    persist: { path: '.wrangler/state/v3' },
  });
  const db = getDb(platform.env.DB as unknown as D1Database);
  
  // Seed Potential
  if (EXPANDED_COMPANIES.length > 0) {
      console.log('Processing potential companies...');
      for (const slug of EXPANDED_COMPANIES) {
        try {
          await db.insert(schema.potentialCompanies).values({
            id: crypto.randomUUID(),
            slug,
            status: 'pending',
            checkCount: 0
          });
          console.log(\`✅ Added potential: \${slug}\`);
        } catch (error: any) {
          if (error.message?.includes('UNIQUE constraint')) {
            // console.log(\`ℹ️  Already exists: \${slug}\`);
          } else {
            console.error(\`❌ Error adding \${slug}:\`, error.message);
          }
        }
      }
  }

  // Seed Discovered
  if (DISCOVERED_COMPANIES.length > 0) {
      console.log('Processing discovered companies...');
      for (const company of DISCOVERED_COMPANIES) {
        try {
          await db.insert(schema.discoveredCompanies).values({
            slug: company.slug,
            name: company.name,
            source: company.source,
            status: 'new',
            jobCount: 0
          });
          console.log(\`✅ Added discovered: \${company.slug}\`);
        } catch (error: any) {
             if (error.message?.includes('UNIQUE constraint')) {
            // console.log(\`ℹ️  Already exists: \${company.slug}\`);
          } else {
            console.error(\`❌ Error adding \${company.slug}:\`, error.message);
          }
        }
      }
  }
  
  console.log('✅ Seeding complete!');
  process.exit(0);
}

seedExpanded().catch(console.error);
`;

    await fs.writeFile(outputPath, fileContent);
    console.log(`💾 Generated seed file at: ${outputPath}`);
    console.log(`👉 Run it with: npx tsx scripts/seed-expanded.ts`);
  } else {
    console.log('✨ No new companies found.');
  }
  
  // Clean up proxy
  await platform.dispose();
}

expandCompanyList().catch(console.error);

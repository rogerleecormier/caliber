import fs from 'fs';
import path from 'path';

// Load the JSON data
const jsonPath = path.join(process.cwd(), 'src/lib/job-sources/greenhouse-companies.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const data = JSON.parse(rawData);

// Extract all slugs from the JSON
const allSlugs = new Set<string>();
Object.values(data.categories).forEach((category: any) => {
  category.companies.forEach((slug: string) => allSlugs.add(slug));
});

// List of companies from the DB (pasted from previous output)
const dbCompanies = [
  "Airbnb", "Cerebral", "Ethos", "Hometap", "Honeycomb.io", "Karat", "LastPass", 
  "Medium", "Monzo", "Neo4j", "Openly", "ura", "Pinterest", "project44", "Reddit", 
  "Warp", "Wayfair", "Wikimedia Foundation", "Wrike", "Zscaler", "Alchemy", 
  "Apollo Education Systems", "AssemblyAI", "Bungie", "Calm.com", "ChargePoint", 
  "Coinbase Careers Page", "Cortex", "Databricks", "Datadog", "Degreed", 
  "Descript", "Discord", "Domo", "Dropbox"
];

const matches: string[] = [];

dbCompanies.forEach(company => {
  const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Try exact match
  if (allSlugs.has(normalized)) {
    matches.push(normalized);
    return;
  }

  // Try partial match (slug contains normalized or normalized contains slug)
  for (const slug of allSlugs) {
    const normSlug = slug.replace(/[^a-z0-9]/g, '');
    if (normalized.includes(normSlug) || normSlug.includes(normalized)) {
      // Special cases
      if (company === "Coinbase Careers Page" && slug === "coinbase") { matches.push(slug); return; }
      if (company === "Calm.com" && slug === "calm") { matches.push(slug); return; }
      if (company === "Honeycomb.io" && slug === "honeycomb") { matches.push(slug); return; }
      if (company === "Wikimedia Foundation" && slug === "wikimedia") { matches.push(slug); return; }
      if (company === "Apollo Education Systems" && slug === "apollo") { matches.push(slug); return; }
      
      // General fuzzy match (risky, but let's see)
      if (normalized === normSlug) {
        matches.push(slug);
        return;
      }
    }
  }
});

// Generate SQL
const sql = matches.map(slug => {
  return `INSERT OR IGNORE INTO discovered_companies (slug, name, source, status, created_at, updated_at) VALUES ('${slug}', '${slug}', 'greenhouse', 'added', unixepoch(), unixepoch());`;
}).join('\n');

console.log(sql);

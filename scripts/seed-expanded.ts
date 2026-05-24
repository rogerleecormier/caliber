import { getDb, schema } from '../src/db/db';
import { getPlatformProxy } from 'wrangler';

export const EXPANDED_COMPANIES = [
  'atco',
];

export const DISCOVERED_COMPANIES = [
  { slug: 'virtu', name: "virtu", source: 'greenhouse' },
  { slug: 'metron', name: "metron", source: 'greenhouse' },
  { slug: 'usafacts', name: "usafacts", source: 'greenhouse' },
  { slug: 'affirm', name: "affirm", source: 'greenhouse' },
  { slug: 'matchgroup', name: "matchgroup", source: 'lever' },
  { slug: 'findhelp', name: "findhelp", source: 'lever' },
  { slug: 'aechelontechnology', name: "aechelontechnology", source: 'greenhouse' },
  { slug: 'octaura', name: "octaura", source: 'greenhouse' },
  { slug: 'brilliant', name: "brilliant", source: 'lever' },
  { slug: 'gntemp', name: "gntemp", source: 'greenhouse' },
  { slug: 'zscaler', name: "zscaler", source: 'greenhouse' },
  { slug: 'benchling', name: "benchling", source: 'greenhouse' },
  { slug: 'bandwidth', name: "bandwidth", source: 'greenhouse' },
  { slug: 'viget', name: "viget", source: 'lever' },
  { slug: 'hpiq', name: "hpiq", source: 'greenhouse' },
  { slug: 'zoox', name: "zoox", source: 'lever' },
  { slug: 'nimblerx', name: "nimblerx", source: 'lever' },
  { slug: 'andurilindustries', name: "andurilindustries", source: 'greenhouse' },
  { slug: 'lumafield', name: "lumafield", source: 'lever' },
  { slug: 'layup', name: "layup", source: 'lever' },
  { slug: 'axontalentcommunity', name: "axontalentcommunity", source: 'greenhouse' },
  { slug: 'bedrockrobotics', name: "bedrockrobotics", source: 'greenhouse' },
  { slug: 'hermeus', name: "hermeus", source: 'lever' },
  { slug: 'theathletic', name: "theathletic", source: 'lever' },
  { slug: 'arcesiumllc', name: "arcesiumllc", source: 'greenhouse' },
  { slug: 'thetradedesk', name: "thetradedesk", source: 'greenhouse' },
  { slug: 'modernizingmedicineinc', name: "modernizingmedicineinc", source: 'greenhouse' },
  { slug: 'merge', name: "merge", source: 'greenhouse' },
  { slug: 'relaypro', name: "relaypro", source: 'greenhouse' },
  { slug: 'sigmacomputing', name: "sigmacomputing", source: 'greenhouse' },
  { slug: 'versana', name: "versana", source: 'lever' },
  { slug: 'eulerity', name: "eulerity", source: 'greenhouse' },
  { slug: 'appian', name: "appian", source: 'greenhouse' },
  { slug: 'purestorage', name: "purestorage", source: 'greenhouse' },
  { slug: 'reliable', name: "reliable", source: 'lever' },
  { slug: 'garnerhealth', name: "garnerhealth", source: 'greenhouse' },
  { slug: 'solopulseco', name: "solopulseco", source: 'lever' },
  { slug: 'doordashusa', name: "doordashusa", source: 'greenhouse' },
  { slug: 'doordashcanada', name: "doordashcanada", source: 'greenhouse' },
  { slug: 'cloudflare', name: "cloudflare", source: 'greenhouse' },
  { slug: 'bluestaq', name: "bluestaq", source: 'greenhouse' },
  { slug: 'gofundme', name: "gofundme", source: 'greenhouse' },
  { slug: 'enova', name: "enova", source: 'greenhouse' },
  { slug: 'truveta', name: "truveta", source: 'greenhouse' },
  { slug: 'willowtree', name: "willowtree", source: 'greenhouse' },
  { slug: 'point72', name: "point72", source: 'greenhouse' },
  { slug: 'spacex', name: "spacex", source: 'greenhouse' },
  { slug: 'opensesame', name: "opensesame", source: 'greenhouse' },
  { slug: 'riotgamesup', name: "riotgamesup", source: 'greenhouse' },
  { slug: 'icapitalnetwork', name: "icapitalnetwork", source: 'greenhouse' },
  { slug: 'everagtester', name: "everagtester", source: 'greenhouse' },
  { slug: 'accuweather', name: "accuweather", source: 'greenhouse' },
  { slug: 'shieldai', name: "shieldai", source: 'lever' },
  { slug: 'attainpartners', name: "attainpartners", source: 'greenhouse' },
  { slug: 'awetomaton', name: "awetomaton", source: 'greenhouse' },
  { slug: 'samsungresearchamericainternship', name: "samsungresearchamericainternship", source: 'greenhouse' },
  { slug: 'stradaeducation', name: "stradaeducation", source: 'lever' },
  { slug: 'tri', name: "tri", source: 'lever' },
  { slug: 'thealleninstitute', name: "thealleninstitute", source: 'greenhouse' },
  { slug: 'summit', name: "summit", source: 'greenhouse' },
  { slug: 'spotify', name: "spotify", source: 'lever' },
  { slug: 'usconec', name: "usconec", source: 'greenhouse' },
  { slug: 'divergent', name: "divergent", source: 'greenhouse' },
  { slug: 'merceradvisors', name: "merceradvisors", source: 'greenhouse' },
  { slug: 'brave', name: "brave", source: 'greenhouse' },
  { slug: 'sixfold', name: "sixfold", source: 'greenhouse' },
  { slug: 'memphismeats', name: "memphismeats", source: 'greenhouse' },
  { slug: 'dxacirca', name: "dxacirca", source: 'greenhouse' },
  { slug: 'detroitlions', name: "detroitlions", source: 'greenhouse' },
  { slug: 'datacor', name: "datacor", source: 'greenhouse' },
  { slug: 'connerstrongbuckelew', name: "connerstrongbuckelew", source: 'greenhouse' },
  { slug: 'lucidmotors', name: "lucidmotors", source: 'greenhouse' },
  { slug: 'samsungsemiconductor', name: "samsungsemiconductor", source: 'greenhouse' },
  { slug: 'kitware', name: "kitware", source: 'lever' },
  { slug: 'wayve', name: "wayve", source: 'greenhouse' },
  { slug: 'tokenmetrics', name: "tokenmetrics", source: 'lever' },
  { slug: 'shyftlabs', name: "shyftlabs", source: 'lever' },
  { slug: 'signifyd95', name: "signifyd95", source: 'greenhouse' },
  { slug: 'weride', name: "weride", source: 'lever' },
  { slug: 'dvtrading', name: "dvtrading", source: 'greenhouse' },
  { slug: 'syntax', name: "syntax", source: 'lever' },
  { slug: 'scminternships', name: "scminternships", source: 'greenhouse' },
  { slug: 'quadraturecapital', name: "quadraturecapital", source: 'greenhouse' },
  { slug: 'gelberhandshake', name: "gelberhandshake", source: 'greenhouse' },
  { slug: 'galaxydigitalservices', name: "galaxydigitalservices", source: 'greenhouse' },
  { slug: 'midpointmarkets', name: "midpointmarkets", source: 'greenhouse' },
  { slug: 'mangroup', name: "mangroup", source: 'greenhouse' },
  { slug: 'figureai', name: "figureai", source: 'greenhouse' },
  { slug: 'leolabs-2', name: "leolabs-2", source: 'lever' },
  { slug: 'mwnaintern', name: "mwnaintern", source: 'greenhouse' },
  { slug: 'cirrus', name: "cirrus", source: 'lever' },
  { slug: 'anysignal', name: "anysignal", source: 'lever' },
  { slug: 'rivosinc', name: "rivosinc", source: 'lever' },
  { slug: 'arcboatcompany', name: "arcboatcompany", source: 'greenhouse' },
  { slug: 'gomotive', name: "gomotive", source: 'greenhouse' },
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
          console.log(`✅ Added potential: ${slug}`);
        } catch (error: any) {
          if (error.message?.includes('UNIQUE constraint')) {
            // console.log(`ℹ️  Already exists: ${slug}`);
          } else {
            console.error(`❌ Error adding ${slug}:`, error.message);
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
          console.log(`✅ Added discovered: ${company.slug}`);
        } catch (error: any) {
             if (error.message?.includes('UNIQUE constraint')) {
            // console.log(`ℹ️  Already exists: ${company.slug}`);
          } else {
            console.error(`❌ Error adding ${company.slug}:`, error.message);
          }
        }
      }
  }
  
  console.log('✅ Seeding complete!');
  process.exit(0);
}

seedExpanded().catch(console.error);

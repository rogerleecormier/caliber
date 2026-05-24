// Seed potential companies via API endpoint
const POTENTIAL_COMPANIES = [
  // Streaming & Entertainment
  'netflix', 'spotify', 'hulu', 'disney', 'paramount', 'peacock', 'max', 'apple-tv',
  
  // AI & ML
  'openai', 'anthropic', 'cohere', 'huggingface', 'stability-ai', 'midjourney', 'runway', 'character-ai',
  'replicate', 'scale-ai', 'labelbox', 'weights-biases', 'roboflow', 'landing-ai',
  
  // Payments & Fintech
  'stripe', 'square', 'adyen', 'checkout', 'plaid', 'marqeta', 'affirm', 'klarna',
  'brex', 'ramp', 'mercury', 'unit', 'modern-treasury', 'increase', 'lithic',
  
  // Crypto & Web3
  'coinbase', 'kraken', 'gemini', 'blockchain', 'opensea', 'alchemy', 'quicknode',
  'chainalysis', 'fireblocks', 'anchorage', 'ledger', 'metamask', 'rainbow', 'phantom',
  
  // E-commerce & Retail
  'shopify', 'amazon', 'ebay', 'etsy', 'wayfair', 'chewy', 'instacart', 'doordash',
  'uber-eats', 'grubhub', 'postmates', 'gopuff', 'getir', 'gorillas',
  
  // Investment & Trading
  'robinhood', 'webull', 'public', 'acorns', 'betterment', 'wealthfront', 'sofi',
  'coinbase-prime', 'kraken-futures', 'interactive-brokers', 'tastytrade',
  
  // Developer Tools & Infrastructure
  'github', 'gitlab', 'bitbucket', 'sourcegraph', 'linear', 'notion', 'coda', 'airtable',
  'retool', 'airplane', 'temporal', 'prefect', 'dagster', 'airbyte', 'fivetran', 'segment',
  
  // Cloud & Infrastructure
  'vercel', 'netlify', 'cloudflare', 'fastly', 'akamai', 'render', 'railway', 'fly-io',
  'heroku', 'digitalocean', 'linode', 'vultr', 'hetzner', 'scaleway',
  
  // Database & Data
  'supabase', 'planetscale', 'neon', 'cockroachdb', 'mongodb', 'redis', 'elastic',
  'snowflake', 'databricks', 'firebolt', 'clickhouse', 'timescale', 'influxdata',
  
  // Monitoring & Observability
  'datadog', 'newrelic', 'dynatrace', 'splunk', 'sentry', 'rollbar', 'bugsnag',
  'logrocket', 'fullstory', 'hotjar', 'mixpanel', 'amplitude', 'heap', 'posthog',
  
  // Security & Auth
  'okta', 'auth0', '1password', 'bitwarden', 'lastpass', 'dashlane', 'keeper',
  'crowdstrike', 'palo-alto-networks', 'fortinet', 'zscaler', 'cloudflare-one',
  
  // Communication & Collaboration
  'slack', 'discord', 'zoom', 'microsoft-teams', 'webex', 'miro', 'figma', 'canva',
  'loom', 'mmhmm', 'around', 'whereby', 'descript', 'otter-ai',
  
  // Design & Creative
  'figma', 'sketch', 'invision', 'framer', 'webflow', 'bubble', 'adalo', 'glide',
  'adobe', 'canva', 'piktochart', 'visme', 'lucidchart', 'mural',
  
  // Marketing & Analytics
  'hubspot', 'marketo', 'mailchimp', 'sendgrid', 'twilio', 'segment', 'rudderstack',
  'customer-io', 'braze', 'iterable', 'klaviyo', 'attentive', 'postscript',
  
  // Sales & CRM
  'salesforce', 'hubspot', 'pipedrive', 'close', 'apollo', 'outreach', 'salesloft',
  'gong', 'chorus-ai', 'clari', 'troops', 'dooly', 'grain',
  
  // HR & Recruiting
  'greenhouse', 'lever', 'ashby', 'workable', 'bamboohr', 'gusto', 'rippling', 'deel',
  'remote', 'oyster', 'carta', 'pulley', 'shareworks', 'equity-zen',
  
  // Healthcare & Biotech
  'oscar-health', 'devoted-health', 'bright-health', 'clover-health', 'cityblock',
  'ro', 'hims', 'nurx', 'cerebral', 'talkspace', 'betterhelp', 'headway',
  
  // Education & Learning
  'coursera', 'udemy', 'skillshare', 'masterclass', 'pluralsight', 'datacamp',
  'codecademy', 'brilliant', 'duolingo', 'babbel', 'rosetta-stone',
  
  // Gaming & Entertainment
  'roblox', 'epic-games', 'unity', 'unreal', 'riot-games', 'activision', 'ea',
  'ubisoft', 'take-two', 'zynga', 'playtika', 'scopely',
  
  // Social & Community
  'reddit', 'pinterest', 'snapchat', 'tiktok', 'twitter', 'meta', 'linkedin',
  'nextdoor', 'meetup', 'eventbrite', 'poshmark', 'depop', 'vinted',
  
  // Travel & Hospitality
  'airbnb', 'booking', 'expedia', 'tripadvisor', 'kayak', 'hopper', 'skyscanner',
  'opentable', 'resy', 'tock', 'sevenrooms', 'toast', 'square-restaurants',
  
  // Real Estate & PropTech
  'zillow', 'redfin', 'compass', 'opendoor', 'offerpad', 'knock', 'homelight',
  'divvy-homes', 'landed', 'point', 'unison', 'flyhomes', 'orchard',
  
  // Transportation & Logistics
  'uber', 'lyft', 'doordash', 'postmates', 'instacart', 'gopuff', 'getir',
  'flexport', 'convoy', 'transfix', 'project44', 'fourkites', 'shippo',
  
  // Climate & Sustainability
  'climeworks', 'carbon-engineering', 'watershed', 'persefoni', 'patch', 'wren',
  'impossible-foods', 'beyond-meat', 'oatly', 'perfect-day', 'upside-foods',
];

async function seedViaWrangler() {
  console.log(`🌱 Seeding ${POTENTIAL_COMPANIES.length} potential companies via Wrangler...`);
  
  const values = POTENTIAL_COMPANIES.map(slug => 
    `('${crypto.randomUUID()}', '${slug}', 'pending', 0, unixepoch())`
  ).join(',\n  ');
  
  const sql = `INSERT OR IGNORE INTO potential_companies (id, slug, status, check_count, added_at) VALUES\n  ${values};`;
  
  console.log('\n📝 Run this command to seed the database:\n');
  console.log(`npx wrangler d1 execute DB --remote --command="${sql.replace(/"/g, '\\"')}"`);
  console.log(`\n✅ This will add ${POTENTIAL_COMPANIES.length} companies to the potential_companies table.`);
}

seedViaWrangler();

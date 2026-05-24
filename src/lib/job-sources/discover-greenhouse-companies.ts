import { getAllCompanies } from "./company-sources";
import { schema } from "../../db/db";
import type { DrizzleD1Database } from "../../db/db";

interface DiscoveredCompany {
  slug: string;
  jobCount: number;
  remoteJobCount: number;
  departments: string[];
  suggestedCategory: string;
  sampleJobs: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testCompany(slug: string): Promise<DiscoveredCompany | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.jobs || !Array.isArray(data.jobs) || data.jobs.length === 0) {
      return null;
    }

    // Filter for remote positions
    const remoteJobs = data.jobs.filter((job: any) => {
      const locationName = job.location?.name?.toLowerCase() || "";
      return locationName.includes("remote");
    });

    if (remoteJobs.length === 0) {
      return null; // Only interested in companies with remote jobs
    }

    // Extract departments
    const departments = new Set<string>();
    remoteJobs.forEach((job: any) => {
      job.departments?.forEach((dept: any) => {
        if (dept.name) departments.add(dept.name);
      });
    });

    // Get sample job titles (up to 5)
    const sampleJobs = remoteJobs.slice(0, 5).map((job: any) => job.title);

    // Suggest category based on job titles and departments
    const suggestedCategory = suggestCategory(
      sampleJobs,
      Array.from(departments)
    );

    return {
      slug,
      jobCount: data.jobs.length,
      remoteJobCount: remoteJobs.length,
      departments: Array.from(departments),
      suggestedCategory,
      sampleJobs,
    };
  } catch (error) {
    return null;
  }
}

function suggestCategory(jobTitles: string[], departments: string[]): string {
  const allText = [...jobTitles, ...departments].join(" ").toLowerCase();

  // Category detection keywords
  const categories = {
    "tech-giants": ["enterprise", "global", "director", "vp", "principal"],
    "established-tech": ["senior", "staff", "lead", "manager"],
    "remote-first": ["remote", "distributed", "anywhere"],
    "startups-scaleups": ["founding", "startup", "early", "growth"],
    fintech: [
      "fintech",
      "payment",
      "banking",
      "crypto",
      "blockchain",
      "financial",
    ],
    "security-devops": [
      "security",
      "devops",
      "infrastructure",
      "sre",
      "platform",
    ],
    "developer-tools": [
      "developer",
      "api",
      "sdk",
      "platform",
      "tools",
      "engineering",
    ],
    "data-analytics": [
      "data",
      "analytics",
      "bi",
      "analyst",
      "data science",
      "ml",
    ],
    "saas-products": ["product", "saas", "software", "application"],
    "design-creative": ["design", "creative", "ux", "ui", "brand", "visual"],
    "healthcare-biotech": ["health", "medical", "bio", "clinical", "patient"],
    "education-learning": [
      "education",
      "learning",
      "teaching",
      "training",
      "course",
    ],
    communication: ["communication", "messaging", "chat", "collaboration"],
    "yc-companies": [], // Will be manually categorized
  };

  let maxScore = 0;
  let bestCategory = "saas-products"; // default

  Object.entries(categories).forEach(([category, keywords]) => {
    const score = keywords.reduce((sum, keyword) => {
      return sum + (allText.includes(keyword) ? 1 : 0);
    }, 0);

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  });

  return bestCategory;
}

function generateSlugVariations(company: string): string[] {
  const variations: string[] = [];

  // Clean the company name
  const cleaned = company
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .trim();

  // Only generate the most common variations:

  // 1. Replace spaces with hyphens (most common)
  const hyphenated = cleaned.replace(/\s+/g, "-");
  variations.push(hyphenated);

  // 2. Remove spaces entirely (second most common)
  const nospaces = cleaned.replace(/\s+/g, "");
  if (nospaces !== hyphenated) {
    variations.push(nospaces);
  }

  // 3. Original with spaces (rare but some use it)
  if (cleaned !== hyphenated && cleaned !== nospaces) {
    variations.push(cleaned);
  }

  // Remove duplicates and return
  return [...new Set(variations)];
}

export async function discoverGreenhouseCompanies(
  db: DrizzleD1Database,
  log: (msg: string, type?: "info" | "success" | "error" | "warning") => void,
  signal?: AbortSignal
) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
  log("🔍 Greenhouse Companies Discovery", "info");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n", "info");

  // Load existing companies from DB
  const existingCompanies = await db
    .select({ slug: schema.discoveredCompanies.slug })
    .from(schema.discoveredCompanies);
  const existingSlugs = new Set(existingCompanies.map((c) => c.slug));

  log(
    `📊 Current database has ${existingSlugs.size} discovered companies`,
    "info"
  );

  // Get potential companies to test
  const potentialCompanies = getAllCompanies();
  log(
    `🎯 Testing ${potentialCompanies.length} potential companies from curated lists\n`,
    "info"
  );

  // Generate variations for each company
  const allVariations = new Set<string>();
  potentialCompanies.forEach((company) => {
    const variations = generateSlugVariations(company);
    variations.forEach((v) => allVariations.add(v));
  });

  // Filter out already existing companies
  const companySlugsToTest = new Set<string>();
  allVariations.forEach((slug) => {
    if (!existingSlugs.has(slug)) {
      companySlugsToTest.add(slug);
    }
  });

  const totalVariations = allVariations.size;
  const alreadyInDb = totalVariations - companySlugsToTest.size;

  log(`🔬 Generated ${totalVariations} slug variations to test`, "info");
  log(`⏭️  Skipping ${alreadyInDb} already in database`, "info");
  log(`🎯 Will test ${companySlugsToTest.size} new companies\n`, "info");

  const discovered: DiscoveredCompany[] = [];
  let tested = 0;
  const total = companySlugsToTest.size;

  log("🔍 Testing companies (this may take a while)...\n", "info");

  for (const slug of companySlugsToTest) {
    if (signal?.aborted) {
      log("🛑 Discovery aborted", "warning");
      break;
    }

    tested++;

    // Show progress every 5 companies or on first/last
    if (tested === 1 || tested % 5 === 0 || tested === total) {
      log(
        `   Progress: ${tested}/${total} (${((tested / total) * 100).toFixed(1)}%)`,
        "info"
      );
    }

    const result = await testCompany(slug);

    if (result) {
      discovered.push(result);
      log(`✅ ${slug}: ${result.remoteJobCount} remote jobs`, "success");

      // Save immediately to DB
      try {
        await db
          .insert(schema.discoveredCompanies)
          .values({
            slug: result.slug,
            name: result.slug, // We don't have the pretty name, use slug
            jobCount: result.jobCount,
            remoteJobCount: result.remoteJobCount,
            departments: result.departments,
            suggestedCategory: result.suggestedCategory,
            sampleJobs: result.sampleJobs,
            source: "greenhouse",
            status: "new",
          })
          .onConflictDoNothing();
      } catch (e) {
        log(`⚠️ Failed to save ${slug}: ${e}`, "error");
      }
    }

    // Rate limiting - 500ms = 2 requests/second (respectful)
    await sleep(500);
  }

  log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
  log("📈 Discovery Results", "info");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n", "info");

  log(`🔬 Companies tested: ${tested}`, "info");
  log(`✅ Companies discovered: ${discovered.length}`, "success");
  log(
    `🎯 Success rate: ${tested > 0 ? ((discovered.length / tested) * 100).toFixed(1) : 0}%`,
    "info"
  );

  return {
    tested,
    discovered: discovered.length,
  };
}

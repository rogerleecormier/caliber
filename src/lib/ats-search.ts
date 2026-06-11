import { getDb, schema } from '@/db/db';
import { and, inArray, isNull, like } from 'drizzle-orm';
import type { LinkedInScrapedJob, LinkedInSearchParams } from '@/lib/linkedin-search';

// State code to full name dictionary for US locations
const stateNameByCode: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

function isGenericLocation(loc: string): boolean {
  const l = loc.trim().toLowerCase();
  return !l || l === 'united states' || l === 'us' || l === 'usa' || l === 'remote' || l === 'anywhere';
}

/**
 * Parses unstructured salary text (e.g. "$120,000 - $150,000", "$80k-$120k", "$45-$65/hr")
 * to extract minimum and maximum annual salary values. Hourly wages are multiplied by 2000.
 */
export function parseSalaryMinMax(payRange: string | null): { min: number | null; max: number | null } {
  if (!payRange) return { min: null, max: null };
  
  // Clean string and lowercase
  const clean = payRange.replace(/,/g, '').toLowerCase().trim();
  
  // Match numbers optionally followed by k/m suffixes
  const matches = Array.from(clean.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|mil|million)?/g));
  if (matches.length === 0) return { min: null, max: null };
  
  const vals = matches.map(m => {
    let val = parseFloat(m[1]);
    const suffix = m[2];
    if (suffix === 'k') {
      val *= 1000;
    } else if (suffix === 'm' || suffix === 'mil' || suffix === 'million') {
      val *= 1000000;
    }
    return val;
  });
  
  // Classify hourly wages (either explicitly stated as hr/hour/hourly, or numbers are very small)
  const isHourly = /\b(?:hr|hour|hourly)\b/.test(clean) || (vals.length > 0 && vals.every(v => v < 500));
  const multiplier = isHourly ? 2000 : 1;
  const normalizedVals = vals.map(v => v * multiplier);
  
  if (normalizedVals.length === 1) {
    if (/\b(?:up\s+to|max|maximum)\b/.test(clean)) {
      return { min: null, max: normalizedVals[0] };
    }
    return { min: normalizedVals[0], max: normalizedVals[0] };
  }
  
  return {
    min: Math.min(...normalizedVals),
    max: Math.max(...normalizedVals)
  };
}

/**
 * Classifies a job dynamically as remote, hybrid, or on-site based on its title and description.
 */
export function classifyWorkplaceType(title: string, description: string | null): 'remote' | 'hybrid' | 'on-site' {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  if (/\bhybrid\b/.test(text)) {
    return 'hybrid';
  }
  
  if (/\bremote\b/.test(text) || /\bwork[\s-](?:from|at)[\s-]home\b/.test(text) || /\btelecommute\b/.test(text) || /\bvirtual\b/.test(text)) {
    return 'remote';
  }
  
  return 'on-site';
}

/**
 * Matches location city/state names against title and description using word boundaries to avoid false positives.
 */
function matchesLocation(title: string, description: string | null, locationQuery: string): boolean {
  const loc = locationQuery.trim();
  if (isGenericLocation(loc)) return true;
  
  const text = `${title} ${description || ''}`;
  const parts = loc.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  
  return parts.some(part => {
    if (part.length === 2) {
      // 2-letter state code checks with word boundaries (case-sensitive to avoid matching inside words)
      const regex = new RegExp(`\\b${part.toUpperCase()}\\b`);
      const stateName = stateNameByCode[part.toUpperCase()];
      if (stateName) {
        const stateRegex = new RegExp(`\\b${stateName}\\b`, 'i');
        return regex.test(text) || stateRegex.test(text);
      }
      return regex.test(text);
    } else {
      // General name match, case-insensitive with word boundaries
      const regex = new RegExp(`\\b${part}\\b`, 'i');
      return regex.test(text);
    }
  });
}

/**
 * Search local Greenhouse, Lever, and Workable jobs cache using keyword matching
 * and granular in-memory filtering (location, workplace type, salary).
 */
export async function searchAtsJobs(
  db: ReturnType<typeof getDb>,
  sources: string[],
  criteria: LinkedInSearchParams
): Promise<LinkedInScrapedJob[]> {
  const activeAtsSources: string[] = [];
  if (sources.includes('greenhouse')) activeAtsSources.push('greenhouse');
  if (sources.includes('lever')) activeAtsSources.push('lever');
  if (sources.includes('workable')) activeAtsSources.push('workable');

  if (activeAtsSources.length === 0 || !criteria.keywords) {
    return [];
  }

  // Fetch initial base set matching target platforms and title keyword (global ATS catalog)
  const matchedAtsJobs = await db
    .select()
    .from(schema.normalizedJobs)
    .where(
      and(
        isNull(schema.normalizedJobs.userId),
        inArray(schema.normalizedJobs.sourceOrigin, activeAtsSources),
        like(schema.normalizedJobs.jobTitle, `%${criteria.keywords}%`)
      )
    );

  // Apply granular filters in-memory
  const filteredJobs = matchedAtsJobs.filter((job) => {
    const title = job.jobTitle;
    const desc = job.description || job.descriptionPruned || null;

    // 1. Location match filter
    if (criteria.location && !isGenericLocation(criteria.location)) {
      if (!matchesLocation(title, desc, criteria.location)) {
        return false;
      }
    }

    // 2. Workplace type match filter
    const workplace = classifyWorkplaceType(title, desc);
    if (criteria.workplaceTypes && criteria.workplaceTypes.length > 0) {
      if (!criteria.workplaceTypes.includes(workplace as any)) {
        return false;
      }
    }

    // 3. Salary floor filter (keeps jobs without salary, discards jobs explicitly below floor)
    if (criteria.salaryMin != null) {
      const { min, max } = parseSalaryMinMax(job.salary);
      if (min !== null || max !== null) {
        if (max !== null && max < criteria.salaryMin) {
          return false;
        }
        if (max === null && min !== null && min < criteria.salaryMin) {
          return false;
        }
      }
    }

    return true;
  });

  return filteredJobs.map((job) => {
    const title = job.jobTitle;
    const desc = job.description || job.descriptionPruned || null;
    const workplace = classifyWorkplaceType(title, desc);

    // Format location information creatively for UI presentation
    let jobLocation = workplace === 'remote' ? 'Remote' : workplace === 'hybrid' ? 'Hybrid' : 'On-site';
    if (desc) {
      const locMatch = desc.match(/(?:location|office|based\s+in|based\s+out\s+of):\s*([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i);
      if (locMatch?.[1]) {
        jobLocation = `${locMatch[1]} (${jobLocation})`;
      } else if (criteria.location && !isGenericLocation(criteria.location)) {
        jobLocation = `${criteria.location} (${jobLocation})`;
      }
    }

    return {
      id: `ats-${job.id}`,
      title: job.jobTitle,
      company: job.employerName || 'Unknown',
      location: jobLocation,
      sourceUrl: job.sourceUrl,
      sourceName: job.sourceOrigin as any,
      postDateText: job.postDateText || null,
      firstSeenAt: job.createdAt || null,
      createdAt: job.createdAt || null,
      workplaceType: workplace,
      salary: job.salary || null,
      snippet: job.description ? job.description.substring(0, 300) : null,
      description: job.description || null,
    };
  });
}

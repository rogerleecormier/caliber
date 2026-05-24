import { suggestLinkedinSemanticTitles } from "@/server/functions/linkedin-searches";
import type { LinkedInScrapedJob, LinkedInSearchParams } from "@/lib/linkedin-search";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchPreset =
  | "title-variants"
  | "location-spread"
  | "remote-expansion"
  | "workplace-split"
  | "ai-semantic-expansion";

type SearchVariant = {
  label: string;
  params: LinkedInSearchParams;
};

type SearchResponse = {
  success: boolean;
  error?: string;
  data?: {
    searchUrl: string;
    jobs: LinkedInScrapedJob[];
    total: number;
    warnings: string[];
  };
};

export interface RunLinkedinSearchOptions {
  broadenDiscovery?: boolean;
  presets?: SearchPreset[];
  activeSavedSearchId?: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const defaultSearchPresets: SearchPreset[] = [
  "title-variants",
  "location-spread",
  "remote-expansion",
];

const seniorityTokens = new Set(["senior", "sr", "sr.", "lead", "principal", "staff"]);

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

// ─── URL / dedup utilities ────────────────────────────────────────────────────

export function canonicalizeLinkedinJobUrl(sourceUrl: string, externalJobId?: string): string {
  try {
    const url = new URL(sourceUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (normalizedPath.includes("/jobs/view/")) {
      return `https://www.linkedin.com${normalizedPath}/`;
    }
    const currentJobId = url.searchParams.get("currentJobId");
    if (currentJobId) return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
  } catch {
    if (externalJobId && /^\d+$/.test(externalJobId)) {
      return `https://www.linkedin.com/jobs/view/${externalJobId}/`;
    }
  }
  if (externalJobId && /^\d+$/.test(externalJobId)) {
    return `https://www.linkedin.com/jobs/view/${externalJobId}/`;
  }
  return sourceUrl;
}

export function dedupeLinkedinResults(jobs: LinkedInScrapedJob[]): LinkedInScrapedJob[] {
  const deduped = new Map<string, LinkedInScrapedJob>();
  for (const job of jobs) {
    const key = canonicalizeLinkedinJobUrl(job.sourceUrl, job.id);
    const existing = deduped.get(key);
    if (!existing || (job.score?.masterScore || 0) > (existing.score?.masterScore || 0)) {
      deduped.set(key, { ...job, sourceUrl: key });
    }
  }
  return Array.from(deduped.values()).sort(
    (a, b) => (b.score?.masterScore || 0) - (a.score?.masterScore || 0),
  );
}

// ─── Variant builders ─────────────────────────────────────────────────────────

function buildKeywordVariants(keywords: string): string[] {
  const normalized = keywords.trim().replace(/\s+/g, " ");
  const variants = new Set<string>();
  if (!normalized) return [];

  const lowered = normalized.toLowerCase();
  if (lowered.includes("technical project manager")) {
    variants.add(normalized.replace(/technical project manager/i, "technical program manager"));
  }
  if (lowered.includes("project manager")) {
    variants.add(normalized.replace(/project manager/i, "program manager"));
  }
  if (lowered.includes("program manager")) {
    variants.add(normalized.replace(/program manager/i, "project manager"));
  }

  const stripped = normalized
    .split(" ")
    .filter((t) => !seniorityTokens.has(t.toLowerCase()))
    .join(" ")
    .trim();
  if (stripped && stripped.toLowerCase() !== lowered) variants.add(stripped);

  return Array.from(variants).filter((v) => v.toLowerCase() !== lowered).slice(0, 3);
}

function buildLocationVariants(location: string): string[] {
  const normalized = location.trim();
  if (!normalized) return [];

  const variants = new Set<string>();
  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const statePart = parts[parts.length - 1].toUpperCase();
    const stateName = stateNameByCode[statePart];
    if (stateName) {
      variants.add(`${stateName}, United States`);
    } else {
      variants.add(parts.slice(1).join(", "));
    }
  }
  if (!/united states/i.test(normalized)) variants.add("United States");

  return Array.from(variants)
    .filter((v) => v && v.toLowerCase() !== normalized.toLowerCase())
    .slice(0, 2);
}

export function buildSearchVariants(
  base: LinkedInSearchParams,
  presets: SearchPreset[],
  broadenDiscovery: boolean,
  semanticTitleVariants: string[] = [],
): SearchVariant[] {
  const variants = new Map<string, SearchVariant>();
  const register = (label: string, params: LinkedInSearchParams) => {
    const key = JSON.stringify(params);
    if (!variants.has(key)) variants.set(key, { label, params });
  };

  register("Exact search", base);
  if (!broadenDiscovery) return Array.from(variants.values());

  if (presets.includes("title-variants")) {
    for (const kw of buildKeywordVariants(base.keywords)) {
      register(`Title variant: ${kw}`, { ...base, keywords: kw, page: 1 });
    }
  }
  if (presets.includes("ai-semantic-expansion")) {
    for (const title of semanticTitleVariants) {
      register(`AI semantic: ${title}`, { ...base, keywords: title, page: 1 });
    }
  }
  if (presets.includes("location-spread")) {
    for (const loc of buildLocationVariants(base.location || "")) {
      register(`Location spread: ${loc}`, { ...base, location: loc, page: 1 });
    }
  }
  if (presets.includes("remote-expansion") && base.workplaceTypes?.includes("remote")) {
    register("Remote expansion", {
      ...base,
      location: "United States",
      workplaceTypes: ["remote"],
      page: 1,
    });
  }
  if (presets.includes("workplace-split") && (base.workplaceTypes?.length || 0) > 1) {
    for (const wt of base.workplaceTypes || []) {
      register(`Workplace split: ${wt}`, { ...base, workplaceTypes: [wt], page: 1 });
    }
  }

  return Array.from(variants.values());
}

// ─── Warning summarizer ───────────────────────────────────────────────────────

export function summarizeSearchWarnings(rawWarnings: string[], variantCount: number): string[] {
  if (rawWarnings.length === 0) return [];

  const reusedWarnings = rawWarnings.filter((w) => /reused .*previously saved linkedin job/i.test(w));
  const limitedWarnings = rawWarnings.filter((w) => /only exposed about|redirected page|returned no cards/i.test(w));
  const snippetWarnings = rawWarnings.filter((w) => /scored from snippets/i.test(w));
  const otherWarnings = rawWarnings.filter(
    (w) => !reusedWarnings.includes(w) && !limitedWarnings.includes(w) && !snippetWarnings.includes(w),
  );

  const totalReused = reusedWarnings.reduce((sum, w) => {
    const match = w.match(/Reused\s+(\d+)/i);
    return sum + Number(match?.[1] || 0);
  }, 0);

  const variantLabels = new Set(limitedWarnings.map((w) => w.split(":")[0]?.trim()).filter(Boolean));

  const summary: string[] = [];
  if (variantCount > 1) {
    summary.push(`Broader discovery ran ${variantCount} LinkedIn searches and merged the results into one scored list.`);
  }
  if (totalReused > 0) {
    summary.push(`Reused ${totalReused} previously saved LinkedIn jobs where exact matches already existed.`);
  }
  if (variantLabels.size > 0) {
    summary.push("Some expanded searches hit LinkedIn public-result limits, so a few deeper pages were skipped automatically.");
  }
  if (snippetWarnings.length > 0) {
    summary.push("Some jobs were scored from snippets because LinkedIn did not expose a full description.");
  }
  if (otherWarnings.length > 0 && summary.length === 0) {
    summary.push(...otherWarnings.slice(0, 2));
  }

  return summary;
}

// ─── Main execution function ──────────────────────────────────────────────────

export async function runLinkedinSearch(
  params: LinkedInSearchParams,
  options: RunLinkedinSearchOptions = {},
): Promise<{ jobs: LinkedInScrapedJob[]; warnings: string[]; searchUrl: string }> {
  const { broadenDiscovery = false, presets = defaultSearchPresets, activeSavedSearchId = null } = options;

  let semanticTitleVariants: string[] = [];
  if (broadenDiscovery && presets.includes("ai-semantic-expansion")) {
    const semanticResult = await suggestLinkedinSemanticTitles({
      data: { currentTitle: params.keywords, limit: 3 },
    });
    semanticTitleVariants = semanticResult.titles;
  }

  const variants = buildSearchVariants(params, presets, broadenDiscovery, semanticTitleVariants);
  const combinedWarnings: string[] = [];
  const combinedResults: LinkedInScrapedJob[] = [];
  let primarySearchUrl = "";

  if (broadenDiscovery && presets.includes("ai-semantic-expansion")) {
    combinedWarnings.push(
      semanticTitleVariants.length > 0
        ? `AI Semantic Expansion: ${semanticTitleVariants.join(", ")}`
        : "AI Semantic Expansion: no additional titles returned.",
    );
  }

  for (const [index, variant] of variants.entries()) {
    const response = await fetch("/api/linkedin/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...variant.params,
        savedSearchId: index === 0 ? activeSavedSearchId : null,
      }),
    });

    if (!response.ok && !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`LinkedIn search API returned HTTP ${response.status} (non-JSON). Check server logs for details.`);
    }
    const data = (await response.json()) as SearchResponse;
    if (!response.ok || !data.success || !data.data) {
      throw new Error(data.error || `LinkedIn search failed for ${variant.label}.`);
    }

    if (!primarySearchUrl) primarySearchUrl = data.data.searchUrl;
    combinedResults.push(...data.data.jobs);
    combinedWarnings.push(...(data.data.warnings || []).map((w) => `${variant.label}: ${w}`));
  }

  return {
    jobs: dedupeLinkedinResults(combinedResults),
    warnings: summarizeSearchWarnings(Array.from(new Set(combinedWarnings)), variants.length),
    searchUrl: primarySearchUrl,
  };
}

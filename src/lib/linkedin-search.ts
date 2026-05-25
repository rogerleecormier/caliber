export type LinkedInWorkplaceType = "on-site" | "remote" | "hybrid";
export type LinkedInExperienceLevel =
  | "internship"
  | "entry"
  | "associate"
  | "mid-senior"
  | "director"
  | "executive";
export type LinkedInJobType =
  | "full-time"
  | "part-time"
  | "contract"
  | "temporary"
  | "internship"
  | "volunteer"
  | "other";
export type LinkedInPostedWithin = "any" | "24h" | "7d" | "30d";
export type LinkedInSortBy = "recent" | "relevant";

const MAX_LINKEDIN_START_PAGE = 100;
const MAX_LINKEDIN_PAGES_TO_SCAN = 10;
const MAX_LINKEDIN_CARDS_PER_PAGE = 25;

export interface LinkedInSearchParams {
  keywords: string;
  location?: string;
  company?: string;
  region?: string;
  workplaceTypes?: LinkedInWorkplaceType[];
  experienceLevels?: LinkedInExperienceLevel[];
  jobTypes?: LinkedInJobType[];
  postedWithin?: LinkedInPostedWithin;
  salaryMin?: number | null;
  easyApply?: boolean;
  sortBy?: LinkedInSortBy;
  page?: number;
  pagesToScan?: number;
  limit?: number;
  geoId?: string;
  distance?: number | null;
  f_SAL?: string;
  origin?: string;
  useSemanticFormat?: boolean;
}

export interface LinkedInScrapedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
  sourceName: "LinkedIn";
  postDateText: string | null;
  firstSeenAt?: string | null;
  createdAt?: string | null;
  workplaceType: string | null;
  salary: string | null;
  snippet: string | null;
  description: string | null;
  resultSource?: "new" | "history";
  score?: {
    jobId: string;
    atsScore: number;
    careerScore: number;
    outlookScore: number;
    masterScore: number;
    atsReason: string;
    careerReason: string;
    outlookReason: string;
    isUnicorn: boolean;
    unicornReason: string | null;
  };
}

const WORKPLACE_CODES: Record<LinkedInWorkplaceType, string> = {
  "on-site": "1",
  remote: "2",
  hybrid: "3",
};

const EXPERIENCE_CODES: Record<LinkedInExperienceLevel, string> = {
  internship: "1",
  entry: "2",
  associate: "3",
  "mid-senior": "4",
  director: "5",
  executive: "6",
};

const JOB_TYPE_CODES: Record<LinkedInJobType, string> = {
  "full-time": "F",
  "part-time": "P",
  contract: "C",
  temporary: "T",
  internship: "I",
  volunteer: "V",
  other: "O",
};

const POSTED_WITHIN_CODES: Record<Exclude<LinkedInPostedWithin, "any">, string> = {
  "24h": "r86400",
  "7d": "r604800",
  "30d": "r2592000",
};

export interface NormalizedLinkedInSearchParams extends LinkedInSearchParams {
  location: string;
  company: string;
  region: string;
  workplaceTypes: LinkedInWorkplaceType[];
  experienceLevels: LinkedInExperienceLevel[];
  jobTypes: LinkedInJobType[];
  postedWithin: LinkedInPostedWithin;
  easyApply: boolean;
  sortBy: LinkedInSortBy;
  page: number;
  pagesToScan: number;
  limit: number;
  geoId: string;
  distance: number | null;
  f_SAL: string;
  origin: string;
  useSemanticFormat: boolean;
}

export function normalizeLinkedInSearchParams(
  params: Partial<LinkedInSearchParams>,
): NormalizedLinkedInSearchParams {
  return {
    keywords: (params.keywords || "").trim(),
    location: params.location?.trim() || "",
    company: params.company?.trim() || "",
    region: params.region || "US",
    workplaceTypes: params.workplaceTypes || [],
    experienceLevels: params.experienceLevels || [],
    jobTypes: params.jobTypes || [],
    postedWithin: params.postedWithin || "7d",
    salaryMin: params.salaryMin ?? null,
    easyApply: !!params.easyApply,
    sortBy: params.sortBy || "recent",
    page: Math.max(1, Math.min(MAX_LINKEDIN_START_PAGE, Number(params.page || 1))),
    pagesToScan: Math.max(1, Math.min(MAX_LINKEDIN_PAGES_TO_SCAN, Number(params.pagesToScan || 1))),
    limit: Math.max(1, Math.min(MAX_LINKEDIN_CARDS_PER_PAGE, Number(params.limit || 10))),
    geoId: (params.geoId || "").trim(),
    distance: params.distance != null ? Number(params.distance) : null,
    f_SAL: (params.f_SAL || "").trim(),
    origin: params.origin || "SEMANTIC_SEARCH_HISTORY",
    useSemanticFormat: params.useSemanticFormat ?? true,
  };
}

export function buildLinkedInSearchUrlForPage(
  rawParams: Partial<LinkedInSearchParams>,
  pageNumber?: number,
): string {
  const params = normalizeLinkedInSearchParams(rawParams);

  // If the keywords field itself is a valid LinkedIn search URL, use it as the base
  if (params.keywords.startsWith("http://") || params.keywords.startsWith("https://")) {
    try {
      const url = new URL(params.keywords);
      if (url.hostname.includes("linkedin.com") && url.pathname.includes("/jobs/")) {
        const effectivePage = Math.max(1, Math.min(MAX_LINKEDIN_START_PAGE, Number(pageNumber || params.page || 1)));
        const offset = (effectivePage - 1) * 25;
        url.searchParams.set("start", String(offset));
        return url.toString();
      }
    } catch (e) {
      console.error("Failed to parse custom LinkedIn URL:", e);
    }
  }

  const baseUrl = params.useSemanticFormat
    ? "https://www.linkedin.com/jobs/search-results/"
    : "https://www.linkedin.com/jobs/search/";
  const url = new URL(baseUrl);

  let keywords = [params.keywords, params.company].filter(Boolean).join(" ");
  if (params.useSemanticFormat && params.location) {
    keywords = `${keywords} in ${params.location}`;
  }
  url.searchParams.set("keywords", keywords);

  if (!params.useSemanticFormat && params.location) {
    url.searchParams.set("location", params.location);
  }

  if (params.useSemanticFormat) {
    url.searchParams.set("origin", params.origin);
    if (params.geoId) {
      url.searchParams.set("geoId", params.geoId);
    }
    if (params.distance !== null) {
      url.searchParams.set("distance", String(params.distance));
    }
    if (params.f_SAL) {
      url.searchParams.set("f_SAL", params.f_SAL);
    }
  }

  if (params.region) {
    const regionCode = params.region === "US" ? "103" : params.region;
    url.searchParams.set("f_C", regionCode);
  }

  if (params.workplaceTypes.length > 0) {
    url.searchParams.set(
      "f_WT",
      params.workplaceTypes.map((value) => WORKPLACE_CODES[value]).join(","),
    );
  }

  if (params.experienceLevels.length > 0) {
    url.searchParams.set(
      "f_E",
      params.experienceLevels.map((value) => EXPERIENCE_CODES[value]).join(","),
    );
  }

  if (params.jobTypes.length > 0) {
    url.searchParams.set(
      "f_JT",
      params.jobTypes.map((value) => JOB_TYPE_CODES[value]).join(","),
    );
  }

  if (params.postedWithin !== "any") {
    url.searchParams.set("f_TPR", POSTED_WITHIN_CODES[params.postedWithin]);
  }

  if (params.easyApply) {
    url.searchParams.set("f_AL", "true");
    url.searchParams.set("f_EA", "true");
  }

  if (params.salaryMin && params.salaryMin > 0) {
    url.searchParams.set("f_SB2", String(Math.round(params.salaryMin)));
  }

  const effectivePage = Math.max(1, Math.min(MAX_LINKEDIN_START_PAGE, Number(pageNumber || params.page || 1)));
  url.searchParams.set("sortBy", params.sortBy === "recent" ? "DD" : "R");

  const offset = (effectivePage - 1) * 25;
  url.searchParams.set("start", String(offset));

  return url.toString();
}

export function buildLinkedInSearchUrl(rawParams: Partial<LinkedInSearchParams>): string {
  return buildLinkedInSearchUrlForPage(rawParams, rawParams.page);
}

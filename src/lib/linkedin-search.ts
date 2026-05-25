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
  sourceName: "LinkedIn" | "Adzuna" | "Greenhouse" | "Lever" | "Workable" | string;
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

export const SALARY_BANDS: Record<number, string> = {
  40000: "f_SA_id_226001:272015",
  60000: "f_SA_id_226002:272015",
  80000: "f_SA_id_226003:272015",
  100000: "f_SA_id_226004:272015",
  120000: "f_SA_id_226005:272015",
  140000: "f_SA_id_226006:272015",
  160000: "f_SA_id_226007:272015",
  180000: "f_SA_id_226008:272015",
  200000: "f_SA_id_226009:272015",
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
    let effectiveFSal = params.f_SAL;
    if (!effectiveFSal && params.salaryMin && params.salaryMin > 0) {
      const mappingKeys = [40000, 60000, 80000, 100000, 120000, 140000, 160000, 180000, 200000];
      const targetMin = params.salaryMin;
      const bestKey = mappingKeys.reduce((prev, curr) => (curr <= targetMin ? curr : prev), 40000);
      effectiveFSal = SALARY_BANDS[bestKey];
    }
    if (effectiveFSal) {
      url.searchParams.set("f_SAL", effectiveFSal);
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

export interface CityGeoIdOption {
  city: string;
  state: string;
  geoId: string;
}

export const POPULAR_CITIES: CityGeoIdOption[] = [
  // AL
  { city: "Birmingham", state: "Alabama", geoId: "103233808" },
  { city: "Huntsville", state: "Alabama", geoId: "101683407" },
  // AK
  { city: "Anchorage", state: "Alaska", geoId: "105658602" },
  // AZ
  { city: "Phoenix", state: "Arizona", geoId: "106346165" },
  { city: "Tucson", state: "Arizona", geoId: "102715783" },
  // AR
  { city: "Little Rock", state: "Arkansas", geoId: "104192661" },
  // CA
  { city: "Los Angeles", state: "California", geoId: "102002787" },
  { city: "San Francisco", state: "California", geoId: "102277331" },
  { city: "San Diego", state: "California", geoId: "102206411" },
  { city: "San Jose", state: "California", geoId: "101330856" },
  { city: "Sacramento", state: "California", geoId: "101111666" },
  // CO
  { city: "Denver", state: "Colorado", geoId: "105436667" },
  { city: "Colorado Springs", state: "Colorado", geoId: "104938634" },
  // CT
  { city: "Hartford", state: "Connecticut", geoId: "102875155" },
  { city: "New Haven", state: "Connecticut", geoId: "100989391" },
  // DE
  { city: "Wilmington", state: "Delaware", geoId: "103734005" },
  // FL
  { city: "Miami", state: "Florida", geoId: "104116203" },
  { city: "Orlando", state: "Florida", geoId: "105142029" },
  { city: "Tampa", state: "Florida", geoId: "105305928" },
  { city: "Jacksonville", state: "Florida", geoId: "102796695" },
  // GA
  { city: "Atlanta", state: "Georgia", geoId: "106224388" },
  // HI
  { city: "Honolulu", state: "Hawaii", geoId: "103632014" },
  // ID
  { city: "Boise", state: "Idaho", geoId: "102558501" },
  // IL
  { city: "Chicago", state: "Illinois", geoId: "103002691" },
  // IN
  { city: "Indianapolis", state: "Indiana", geoId: "101235123" },
  // IA
  { city: "Des Moines", state: "Iowa", geoId: "105829676" },
  // KS
  { city: "Wichita", state: "Kansas", geoId: "105370395" },
  // KY
  { city: "Louisville", state: "Kentucky", geoId: "102717757" },
  // LA
  { city: "New Orleans", state: "Louisiana", geoId: "104724230" },
  // ME
  { city: "Portland", state: "Maine", geoId: "100236357" },
  // MD
  { city: "Baltimore", state: "Maryland", geoId: "101746274" },
  // MA
  { city: "Boston", state: "Massachusetts", geoId: "102380063" },
  // MI
  { city: "Detroit", state: "Michigan", geoId: "103986036" },
  // MN
  { city: "Minneapolis", state: "Minnesota", geoId: "105741279" },
  // MS
  { city: "Jackson", state: "Mississippi", geoId: "103138883" },
  // MO
  { city: "Kansas City", state: "Missouri", geoId: "101569421" },
  { city: "St. Louis", state: "Missouri", geoId: "103759904" },
  // MT
  { city: "Billings", state: "Montana", geoId: "104764835" },
  // NE
  { city: "Omaha", state: "Nebraska", geoId: "100185906" },
  // NV
  { city: "Las Vegas", state: "Nevada", geoId: "104443905" },
  // NH
  { city: "Manchester", state: "New Hampshire", geoId: "101416766" },
  // NJ
  { city: "Newark", state: "New Jersey", geoId: "106263595" },
  // NM
  { city: "Albuquerque", state: "New Mexico", geoId: "104273873" },
  // NY
  { city: "New York City", state: "New York", geoId: "102448124" },
  { city: "Buffalo", state: "New York", geoId: "105260171" },
  // NC
  { city: "Charlotte", state: "North Carolina", geoId: "105007324" },
  { city: "Raleigh", state: "North Carolina", geoId: "100913968" },
  // ND
  { city: "Fargo", state: "North Dakota", geoId: "101683318" },
  // OH
  { city: "Columbus", state: "Ohio", geoId: "102396837" },
  { city: "Cleveland", state: "Ohio", geoId: "100414436" },
  { city: "Cincinnati", state: "Ohio", geoId: "101582236" },
  // OK
  { city: "Oklahoma City", state: "Oklahoma", geoId: "105740445" },
  // OR
  { city: "Portland", state: "Oregon", geoId: "103284001" },
  // PA
  { city: "Philadelphia", state: "Pennsylvania", geoId: "103537275" },
  { city: "Pittsburgh", state: "Pennsylvania", geoId: "105080838" },
  // RI
  { city: "Providence", state: "Rhode Island", geoId: "101183350" },
  // SC
  { city: "Columbia", state: "South Carolina", geoId: "106208630" },
  // SD
  { city: "Sioux Falls", state: "South Dakota", geoId: "103138547" },
  // TN
  { city: "Nashville", state: "Tennessee", geoId: "105430372" },
  { city: "Memphis", state: "Tennessee", geoId: "105370217" },
  // TX
  { city: "Houston", state: "Texas", geoId: "102287429" },
  { city: "Dallas", state: "Texas", geoId: "101601130" },
  { city: "Austin", state: "Texas", geoId: "106215326" },
  { city: "San Antonio", state: "Texas", geoId: "101235282" },
  // UT
  { city: "Salt Lake City", state: "Utah", geoId: "101416849" },
  // VT
  { city: "Burlington", state: "Vermont", geoId: "104116035" },
  // VA
  { city: "Richmond", state: "Virginia", geoId: "105658428" },
  { city: "Virginia Beach", state: "Virginia", geoId: "102558296" },
  // WA
  { city: "Seattle", state: "Washington", geoId: "104246714" },
  // WV
  { city: "Charleston", state: "West Virginia", geoId: "101234977" },
  // WI
  { city: "Milwaukee", state: "Wisconsin", geoId: "106346141" },
  // WY
  { city: "Cheyenne", state: "Wyoming", geoId: "105007062" },
];

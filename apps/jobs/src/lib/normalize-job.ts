// Shared, source-agnostic normalization helpers used by the canonical ingestion path
// (crawlers/aggregators/discovery) and the data migration. Pure functions, no I/O.

const COMPANY_STOP_WORDS = new Set([
  "the", "company", "co", "corp", "corporation", "inc", "incorporated", "llc",
  "ltd", "limited", "group", "holdings", "holding", "solutions", "services",
  "technologies", "technology", "systems", "international", "global",
]);

export function normalizeForKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeCompany(company: string | null | undefined): string {
  const base = normalizeForKey(company || "");
  const tokens = base.split(" ").filter((t) => t && !COMPANY_STOP_WORDS.has(t));
  return tokens.length > 0 ? tokens.slice(0, 3).join(" ") : base;
}

// Stable semantic identity for cross-source dedup: company::title::location.
export function buildDedupeKey(input: {
  title: string;
  company?: string | null;
  location?: string | null;
}): string {
  const title = normalizeForKey(input.title);
  const company = normalizeCompany(input.company);
  const location = normalizeForKey(input.location || "");
  return `${company}::${title}::${location}`;
}

// Lightweight synchronous djb2 hash → hex. Used for exact-content dedup guard.
export function computeContentHash(parts: Array<string | null | undefined>): string {
  const str = parts.map((p) => normalizeForKey(p || "")).join("|");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export interface ParsedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR" };

// Parse free-form pay strings like "USD 100,000 - 150,000/year" or "$120k–$150k".
export function parseSalary(payRange: string | null | undefined): ParsedSalary {
  const empty: ParsedSalary = { salaryMin: null, salaryMax: null, salaryCurrency: null };
  if (!payRange) return empty;
  const text = payRange.trim();
  if (!text) return empty;

  let currency: string | null = null;
  const codeMatch = text.match(/\b([A-Z]{3})\b/);
  if (codeMatch) currency = codeMatch[1];
  if (!currency) {
    for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (text.includes(sym)) { currency = code; break; }
    }
  }

  // Capture numbers, supporting "k" suffix (e.g. 120k) and thousands separators.
  const numberMatches = [...text.matchAll(/(\d[\d,.]*)\s*([kK])?/g)]
    .map((m) => {
      const raw = m[1].replace(/,/g, "");
      let n = parseFloat(raw);
      if (!Number.isFinite(n)) return null;
      if (m[2]) n *= 1000;
      return Math.round(n);
    })
    .filter((n): n is number => n !== null && n >= 1000); // ignore stray small numbers

  if (numberMatches.length === 0) return { ...empty, salaryCurrency: currency };
  const salaryMin = numberMatches[0];
  const salaryMax = numberMatches.length > 1 ? numberMatches[numberMatches.length - 1] : null;
  return { salaryMin, salaryMax, salaryCurrency: currency };
}

export function deriveSeniority(title: string, description?: string | null): string | null {
  const t = ` ${normalizeForKey(title)} ${normalizeForKey(description || "")} `;
  if (/\b(chief|cto|ceo|cfo|coo|vp|vice president|head of|svp)\b/.test(t)) return "executive";
  if (/\bdirector\b/.test(t)) return "director";
  if (/\b(principal|staff|lead|architect)\b/.test(t)) return "lead";
  if (/\b(senior|sr|sr.)\b/.test(t)) return "senior";
  if (/\b(junior|jr|entry|intern|internship|graduate|new grad)\b/.test(t)) return "entry";
  if (/\b(associate)\b/.test(t)) return "associate";
  if (/\b(manager|mgr)\b/.test(t)) return "senior";
  return "mid";
}

export function deriveEmploymentType(title: string, description?: string | null): string | null {
  const t = ` ${normalizeForKey(title)} ${normalizeForKey(description || "")} `;
  if (/\b(internship|intern)\b/.test(t)) return "internship";
  if (/\b(contract|contractor|freelance|c2c|1099)\b/.test(t)) return "contract";
  if (/\b(temporary|temp|seasonal)\b/.test(t)) return "temporary";
  if (/\b(part time|part-time|parttime)\b/.test(t)) return "part_time";
  return "full_time";
}

export interface NormalizedJobFields {
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  companyNormalized: string;
  contentHash: string;
  dedupeKey: string;
}

export function normalizeJobFields(input: {
  title: string;
  company?: string | null;
  description?: string | null;
  location?: string | null;
  payRange?: string | null;
}): NormalizedJobFields {
  const salary = parseSalary(input.payRange);
  return {
    location: input.location || null,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    employmentType: deriveEmploymentType(input.title, input.description),
    seniorityLevel: deriveSeniority(input.title, input.description),
    companyNormalized: normalizeCompany(input.company),
    contentHash: computeContentHash([input.title, input.company, input.description]),
    dedupeKey: buildDedupeKey({ title: input.title, company: input.company, location: input.location }),
  };
}

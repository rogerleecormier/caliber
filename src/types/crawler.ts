export interface AtsJobResponse {
  id: string;
  title: string;
  company?: string;
  location?: string | { city?: string; state?: string; country?: string; remote?: boolean };
  description?: string | { plain?: string; html?: string };
  compensation?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  absoluteUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;  // Preserve original response
}

export interface NormalizedJob {
  companyDisplay: string;
  companyNorm: string;
  titleDisplay: string;
  titleNorm: string;
  locationDisplay?: string;
  locationNorm?: string;
  remote: boolean;
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  dedupKey: string;  // Stage 1 composite hash
  rawHash: string;   // SHA256 of original JSON
}

export interface CanonicalJob {
  id: string;
  companyDisplay: string;
  companyNorm: string;
  titleDisplay: string;
  titleNorm: string;
  locationDisplay?: string;
  locationNorm?: string;
  remote: boolean;
  employmentType?: string;
  experienceLevel?: string;
  department?: string;
  team?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  dedupKey: string;
  vectorId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt?: string;
  sources: JobSource[];
}

export interface JobSource {
  id: string;
  canonicalId: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workable' | 'recruitee' | 'personio' | 'remoteok' | 'himalayas' | 'jobicy' | 'adzuna' | 'jooble' | 'remotive';
  boardToken: string;
  sourceJobId: string;
  sourceUrl: string;
  applyUrl: string;
  rawHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface DedupResult {
  action: 'merge_with' | 'insert_new';
  canonicalId?: string;
  stage: 1 | 2 | 3 | 4;  // Which dedup stage matched/decided
  score?: number;        // cosine (0–1) or LLM confidence
  auditEntry: AuditEvent;
}

export interface AuditEvent {
  eventType: 'crawl_start' | 'crawl_complete' | 'dedup_merge' | 'vector_insert' | 'llm_call' | 'error';
  ats?: string;
  boardToken?: string;
  canonicalId?: string;
  sourceId?: string;
  details: Record<string, unknown>;
  actor: string;
  timestamp: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
  tokensRemaining?: number;
}

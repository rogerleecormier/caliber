// Unified job interface — all third-party APIs map to this canonical shape
export interface UnifiedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  source: 'adzuna' | 'jooble' | 'remotive';
  postedDate?: Date;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  description?: string;
  jobType?: 'full-time' | 'part-time' | 'contract' | 'temporary';
  remote?: boolean;
  rawData?: unknown; // Original API response for debugging
}

export interface JobServiceOptions {
  kvNamespace: any; // KVNamespace from Cloudflare Workers
  cacheTtlSeconds?: number;
  rateLimitPerMinute?: number;
}

export interface AdzunaJob {
  job_id: string;
  job_title: string;
  company: {
    display_name: string;
  };
  location: {
    display_name: string;
  };
  redirect_url: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency_code?: string;
  description?: string;
  contract_type?: string;
}

export interface JoobleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  link: string;
  snippet: string;
  salary?: string;
  type?: string;
  updated: number;
}

export interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  location: string;
  url: string;
  publication_date: string;
  job_type: 'full-time' | 'part-time' | 'contract';
  description: string;
  salary?: {
    from?: number;
    to?: number;
    currency?: string;
  };
}

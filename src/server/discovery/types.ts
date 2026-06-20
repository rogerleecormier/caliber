export interface CompanySource {
  name: string;
  domain?: string;
  headquarters?: string;
  employees?: number;
  founded?: number;
  source: 'fortune500' | 'yc' | 'crunchbase' | 'sec' | 'github' | 'manual';
}

export interface CareerPagePatterns {
  basePatterns: string[];
  atsSpecificPatterns: Record<string, string[]>;
}

export interface TokenInferenceResult {
  ats: string;
  inferredTokens: string[];
  confidence: number;
}

export interface SearchResult {
  company: string;
  url: string;
  ats?: string;
  source: 'google_dork' | 'serp_api';
}

export interface FeedBoard {
  company: string;
  ats: string;
  token: string;
  source: 'indeed_api' | 'ziprecruiter_api' | 'dice_api' | 'rss';
}

export interface DiscoveredBoard {
  company: string;
  ats: string;
  token: string;
  confidence: number;
  discoveryPhase: string;
}

import { DEFAULT_MODEL, type AIEnv } from './types';
import { JOB_INSIGHTS_PROMPT, SEMANTIC_SEARCH_PROMPT } from './prompts';
import { callWorkersAI } from '@/lib/ai-gateway';
import type { CloudflareEnv } from '@/lib/cloudflare';

type AICapableEnv = Partial<CloudflareEnv> | AIEnv;

/**
 * Robust helper to get AI binding from context, including dev mode proxying.
 */
export async function getAIFromContext(context: any): Promise<AIEnv['AI'] | null> {
  let ai = context?.cloudflare?.env?.AI;

  if (!ai) ai = context?.env?.AI;
  if (!ai) ai = context?.AI;

  if (!ai && typeof globalThis !== 'undefined') {
    const cfEnv = (globalThis as any).__CF_ENV__;
    if (cfEnv) ai = cfEnv.AI;
  }

  if (!ai && typeof globalThis !== 'undefined') {
    ai = (globalThis as any).AI;
  }

  // Development mode — use getPlatformProxy to connect to remote AI
  if (!ai && (import.meta.env?.DEV || process.env.NODE_ENV === 'development')) {
    try {
      const { getPlatformProxy } = await import(/* @vite-ignore */ 'wrangler');
      const proxy = await getPlatformProxy({ configPath: './wrangler.toml' });
      // @ts-ignore
      ai = proxy.env.AI;
    } catch (error) {
      console.error('[AI] Failed to get platform proxy:', error);
    }
  }

  return ai || null;
}

export interface JobInsights {
  estimatedSalary: {
    min: number | null;
    max: number | null;
    currency: string;
    confidence: 'high' | 'medium' | 'low';
  };
  cultureSignals: Array<{
    signal: string;
    interpretation: string;
    sentiment: 'positive' | 'neutral' | 'warning';
  }>;
  redFlags: Array<{
    flag: string;
    reason: string;
  }>;
  workLifeBalance: 'excellent' | 'good' | 'moderate' | 'demanding' | 'unknown';
  remoteFlexibility: 'fully_remote' | 'hybrid' | 'office' | 'unknown';
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | 'unknown';
  keyRequirements: string[];
  niceToHaves: string[];
  summary: string;
}

export interface ParsedSearchQuery {
  keywords: string[];
  skills: string[];
  jobType: string | null;
  seniorityLevel: string | null;
  companyType: string | null;
  preferences: {
    workLifeBalance: boolean;
    remote: boolean;
    highPaying: boolean;
  };
  excludeTerms: string[];
}

export async function analyzeJobInsights(
  env: AICapableEnv,
  jobDescription: string,
  jobTitle?: string,
): Promise<JobInsights> {
  const userContent = jobTitle
    ? `Job Title: ${jobTitle}\n\nJob Description:\n${jobDescription}`
    : jobDescription;

  try {
    const responseText = await callWorkersAI(env, [
      { role: 'system', content: JOB_INSIGHTS_PROMPT },
      { role: 'user', content: userContent },
    ], { maxTokens: 1000 });

    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const bracketMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (bracketMatch) jsonStr = bracketMatch[0];
    }

    return JSON.parse(jsonStr.trim()) as JobInsights;
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return {
      estimatedSalary: { min: null, max: null, currency: 'USD', confidence: 'low' },
      cultureSignals: [],
      redFlags: [],
      workLifeBalance: 'unknown',
      remoteFlexibility: 'unknown',
      seniorityLevel: 'unknown',
      keyRequirements: [],
      niceToHaves: [],
      summary: 'Unable to analyze this job posting.',
    };
  }
}

export async function parseSearchQuery(
  env: AICapableEnv,
  query: string,
): Promise<ParsedSearchQuery> {
  try {
    const responseText = await callWorkersAI(env, [
      { role: 'system', content: SEMANTIC_SEARCH_PROMPT },
      { role: 'user', content: query },
    ], { maxTokens: 500 });

    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const bracketMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (bracketMatch) jsonStr = bracketMatch[0];
    }

    return JSON.parse(jsonStr.trim()) as ParsedSearchQuery;
  } catch (error) {
    console.error('Failed to parse search query:', error);
    return {
      keywords: query.split(/\s+/).filter((w) => w.length > 2),
      skills: [],
      jobType: null,
      seniorityLevel: null,
      companyType: null,
      preferences: { workLifeBalance: false, remote: false, highPaying: false },
      excludeTerms: [],
    };
  }
}

export * from './types';
export * from './prompts';

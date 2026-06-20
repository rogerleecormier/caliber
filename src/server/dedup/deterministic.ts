import { findFuzzyMatch } from './fuzzy';
import type { NormalizedJob } from '@/types/crawler';
import type { Env } from '../db/queries';

export interface DedupDecision {
  action: 'merge_with' | 'insert_new';
  canonicalId?: string;
  stage: 1 | 2 | 3 | 4;
  score?: number;
}

export async function dedupPipeline(
  env: Env,
  normalized: NormalizedJob
): Promise<DedupDecision> {
  // Stage 1: Deterministic check (Exact match on dedupKey)
  const existing = await env.DB.prepare(
    'SELECT id FROM canonical_jobs WHERE dedup_key = ?'
  ).bind(normalized.dedupKey).first<{ id: string }>();

  if (existing) {
    return {
      action: 'merge_with',
      canonicalId: existing.id,
      stage: 1,
      score: 1.0
    };
  }

  // Stage 2: Fuzzy title check (Jaro-Winkler)
  const fuzzyResult = await findFuzzyMatch(env, normalized);
  if (fuzzyResult.match) {
    return {
      action: 'merge_with',
      canonicalId: fuzzyResult.canonicalId,
      stage: 2,
      score: fuzzyResult.score
    };
  }

  // Stage 3 & 4: Stubs (to be populated in Phase 4 & 5)
  // Let's hook them if we have files, else return insert_new
  try {
    const { findEmbeddingMatch } = await import('./embedding');
    const embedResult = await findEmbeddingMatch(env, normalized);
    
    if (embedResult.action === 'merge_with') {
      return {
        action: 'merge_with',
        canonicalId: embedResult.canonicalId,
        stage: 3,
        score: embedResult.score
      };
    } else if (embedResult.action === 'escalate_llm') {
      const { compareJobsWithLLM } = await import('./llm');
      
      // Fetch the candidate job details
      const candidate = await env.DB.prepare(
        'SELECT id, company_display, title_display, location_display, description_plain FROM canonical_jobs WHERE id = ?'
      ).bind(embedResult.canonicalId).first<{
        id: string;
        company_display: string;
        title_display: string;
        location_display: string | null;
        description_plain: string | null;
      }>();
      
      if (candidate) {
        const candidateJob: NormalizedJob = {
          companyDisplay: candidate.company_display,
          companyNorm: '', // not needed in LLM compare
          titleDisplay: candidate.title_display,
          titleNorm: '',
          locationDisplay: candidate.location_display ?? undefined,
          descriptionPlain: candidate.description_plain ?? undefined,
          remote: false,
          dedupKey: '',
          rawHash: '',
        };
        
        const llmResult = await compareJobsWithLLM(env, normalized, candidateJob);
        if (llmResult.same && llmResult.confidence >= 0.75) {
          return {
            action: 'merge_with',
            canonicalId: candidate.id,
            stage: 4,
            score: llmResult.confidence
          };
        }
      }
    }
  } catch (e) {
    // If embedding/llm modules are not loaded or fail, fall back to inserting new
  }

  return {
    action: 'insert_new',
    stage: 2
  };
}

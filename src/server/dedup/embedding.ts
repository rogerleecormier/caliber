import type { NormalizedJob } from '@/types/crawler';
import type { Env } from '../db/queries';

export async function embedJob(env: Env, job: NormalizedJob): Promise<number[]> {
  if (!env.AI) {
    throw new Error('Cloudflare AI binding "AI" is not available');
  }

  // Compose text representation for the embedding
  const text = `${job.titleDisplay} | ${job.companyDisplay} | ${job.locationDisplay || 'Remote'} | ${(job.descriptionPlain || '').substring(0, 500)}`;
  
  const response = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
    text: [text]
  });

  // The response is usually { data: number[][] } or similar depending on the wrangler runtime version
  const vector = response.data?.[0];
  if (!vector || !Array.isArray(vector)) {
    throw new Error('Failed to generate embedding vector from AI model');
  }

  return vector;
}

export async function upsertVector(
  env: Env,
  canonicalId: string,
  companyNorm: string,
  vector: number[]
): Promise<void> {
  if (!env.VECTORIZE) {
    console.warn('[embedding] Vectorize binding is not available, skipping index write');
    return;
  }

  await env.VECTORIZE.upsert([
    {
      id: canonicalId,
      values: vector,
      metadata: {
        company_norm: companyNorm,
        canonical_id: canonicalId
      }
    }
  ]);
  
  // Update canonical_jobs to set vector_id pointer
  await env.DB.prepare('UPDATE canonical_jobs SET vector_id = ? WHERE id = ?')
    .bind(canonicalId, canonicalId)
    .run();
}

export async function findEmbeddingMatch(
  env: Env,
  normalized: NormalizedJob
): Promise<{ action: 'merge_with' | 'escalate_llm' | 'insert_new'; canonicalId?: string; score?: number }> {
  if (!env.VECTORIZE || !env.AI) {
    return { action: 'insert_new' };
  }

  try {
    const vector = await embedJob(env, normalized);
    
    // Query Vectorize, filtering by same company to control comparisons and latency
    const results = await env.VECTORIZE.query(vector, {
      returnMetadata: 'all',
      returnValues: false,
      topK: 5,
      filter: {
        company_norm: normalized.companyNorm
      }
    });

    if (!results.matches || results.matches.length === 0) {
      return { action: 'insert_new' };
    }

    // Sort matches by score descending
    const matches = results.matches.sort((a, b) => b.score - a.score);
    const topMatch = matches[0];
    const score = topMatch.score;
    const canonicalId = String(topMatch.metadata?.canonical_id || topMatch.id);

    // Apply thresholds
    const autoMergeThreshold = parseFloat(env.COSINE_AUTO_MERGE_THRESHOLD || '0.92');
    const grayZoneLow = parseFloat(env.COSINE_GRAY_ZONE_LOW || '0.82');
    const grayZoneHigh = parseFloat(env.COSINE_GRAY_ZONE_HIGH || '0.92');

    if (score >= autoMergeThreshold) {
      return { action: 'merge_with', canonicalId, score };
    } else if (score >= grayZoneLow && score < grayZoneHigh) {
      return { action: 'escalate_llm', canonicalId, score };
    }
  } catch (error) {
    console.error('[embedding] Error querying Vectorize index:', error);
  }

  return { action: 'insert_new' };
}

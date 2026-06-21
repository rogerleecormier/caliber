import type { NormalizedJob } from '@/types/crawler';
import type { Env } from '../db/queries';

// Jaro-Winkler string similarity implementation
export function jaroWinkler(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  
  if (str1 === str2) return 1.0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  // Max distance for matching characters
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const searchRange = Math.max(0, matchWindow);
  
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - searchRange);
    const end = Math.min(len2 - 1, i + searchRange);
    
    for (let j = start; j <= end; j++) {
      if (!matches2[j] && str1[i] === str2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) {
        k++;
      }
      if (str1[i] !== str2[k]) {
        transpositions++;
      }
      k++;
    }
  }
  
  const jaro = (
    (matches / len1) +
    (matches / len2) +
    ((matches - transpositions / 2) / matches)
  ) / 3.0;
  
  // Winkler adjustment
  const p = 0.1; // scaling factor
  let prefix = 0; // common prefix length (max 4)
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }
  
  return jaro + (prefix * p * (1.0 - jaro));
}

export async function findFuzzyMatch(
  env: Env,
  normalized: NormalizedJob,
  threshold = 0.87,
  candidates?: Array<{ id: string; title_norm: string; location_norm: string | null }>
): Promise<{ match: boolean; canonicalId?: string; score?: number }> {
  // Query all canonical jobs from the same company if not pre-loaded
  let candidateList = candidates;
  if (!candidateList) {
    const { results } = await env.DB.prepare(
      'SELECT id, title_norm, location_norm FROM canonical_jobs WHERE company_norm = ?'
    ).bind(normalized.companyNorm).all<{ id: string; title_norm: string; location_norm: string | null }>();
    candidateList = results;
  }

  if (!candidateList || candidateList.length === 0) {
    return { match: false };
  }

  interface MatchCandidate {
    id: string;
    score: number;
  }

  const matches: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const score = jaroWinkler(normalized.titleNorm, candidate.title_norm);
    if (score >= threshold) {
      matches.push({ id: candidate.id, score });
    }
  }

  // Sort candidates by score descending
  matches.sort((a, b) => b.score - a.score);

  // If we have exactly one match above threshold, merge it!
  if (matches.length === 1) {
    return { match: true, canonicalId: matches[0].id, score: matches[0].score };
  }

  // If there are multiple ambiguous matches, let's take the top one if it is significantly higher,
  // or return no match and escalate to the next stage (Stage 3).
  if (matches.length > 1) {
    const top = matches[0];
    const second = matches[1];
    
    // If the top match is > 0.95 and is at least 0.05 ahead of the second match, auto-merge it
    if (top.score >= 0.95 && (top.score - second.score) >= 0.05) {
      return { match: true, canonicalId: top.id, score: top.score };
    }
  }

  return { match: false };
}

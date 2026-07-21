import { callWorkersAI } from '@/lib/ai-gateway';
import { AI_MODELS } from '@/lib/ai/types';
import type { NormalizedJob } from '@/types/crawler';
import type { Env } from '../db/queries';

export async function compareJobsWithLLM(
  env: Env,
  job1: NormalizedJob,
  job2: NormalizedJob
): Promise<{ same: boolean; confidence: number }> {
  const prompt = `Are these two job postings for the same role at the same company?

Job 1:
- Company: ${job1.companyDisplay}
- Title: ${job1.titleDisplay}
- Location: ${job1.locationDisplay || 'Remote'}
- Description (first 300 chars): ${(job1.descriptionPlain || '').substring(0, 300)}

Job 2:
- Company: ${job2.companyDisplay}
- Title: ${job2.titleDisplay}
- Location: ${job2.locationDisplay || 'Remote'}
- Description (first 300 chars): ${(job2.descriptionPlain || '').substring(0, 300)}

Respond ONLY with JSON: { "same_role": boolean, "confidence": 0.0-1.0 }`;

  try {
    const responseText = await callWorkersAI(
      env,
      [
        { role: 'system', content: 'You are an AI assistant specialized in comparing job listings for deduplication. Respond ONLY in valid JSON.' },
        { role: 'user', content: prompt }
      ],
      {
        model: AI_MODELS.LLAMA_3_1_8B,
        temperature: 0.1, // low temperature for deterministic decisions
        maxTokens: 150,
        responseFormat: { type: "json_object" }
      }
    );

    let cleanJson = responseText.trim();
    // Extract JSON block from response if markdown wrapped
    const match = cleanJson.match(/\{[\s\S]*\}/);
    if (match) {
      cleanJson = match[0];
    }

    const parsed = JSON.parse(cleanJson);
    return {
      same: !!parsed.same_role,
      confidence: Number(parsed.confidence ?? 0.0)
    };
  } catch (e) {
    console.error('[llm-dedup] Error comparing jobs with LLM:', e);
    // Fallback: not same (conservative choice)
    return { same: false, confidence: 0.0 };
  }
}

import { UnifiedJob } from './types';
import { callWorkersAI } from '@/lib/ai-gateway';
import { AI_MODELS, DEFAULT_MODEL } from '@/lib/ai/types';

interface EnrichedJobDescription {
  summary: string;
  keyRequirements: string[];
  keyResponsibilities: string[];
  seniorityLevel: string;
  skillsRequired: string[];
  analysisModel: string;
}

export class JoobleEnricher {
  private env: { AI?: any };

  constructor(env: { AI?: any }) {
    if (!env?.AI) {
      throw new Error('Workers AI binding required for job enrichment');
    }
    this.env = env;
  }

  /**
   * Analyze a Jooble snippet using Workers AI (Llama 3.1 8B) to extract structured job information
   * Useful for when full descriptions aren't available
   */
  async enrichJobFromSnippet(job: UnifiedJob): Promise<EnrichedJobDescription> {
    if (!job.description) {
      throw new Error('Job description snippet required for enrichment');
    }

    const prompt = `Analyze this job posting snippet and extract key information:

Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Job Type: ${job.jobType || 'Not specified'}
Snippet: ${job.description}

Please provide a structured analysis with:
1. A 2-3 sentence summary of the role
2. Key requirements (bulleted list)
3. Key responsibilities (bulleted list)
4. Seniority level (junior/mid/senior/executive)
5. Required skills (comma-separated list)

Format your response as JSON with keys: summary, keyRequirements, keyResponsibilities, seniorityLevel, skillsRequired`;

    const responseText = await callWorkersAI(this.env, [
      { role: 'user', content: prompt },
    ], { model: AI_MODELS.LLAMA_3_1_8B, maxTokens: 500 });

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Workers AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<EnrichedJobDescription, 'analysisModel'>;

    return {
      ...parsed,
      analysisModel: AI_MODELS.LLAMA_3_1_8B,
    };
  }

  /**
   * Batch enrich multiple job snippets
   * Adds delay between requests to respect rate limits
   */
  async batchEnrichJobs(jobs: UnifiedJob[], delayMs: number = 500): Promise<Map<string, EnrichedJobDescription>> {
    const results = new Map<string, EnrichedJobDescription>();

    for (const job of jobs) {
      try {
        const enriched = await this.enrichJobFromSnippet(job);
        results.set(job.id, enriched);

        // Respectful delay between requests
        if (jobs.indexOf(job) < jobs.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (error) {
        console.warn(`Failed to enrich job ${job.id}:`, error instanceof Error ? error.message : String(error));
      }
    }

    return results;
  }
}

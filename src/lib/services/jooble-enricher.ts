import { UnifiedJob } from './types';

interface EnrichedJobDescription {
  summary: string;
  keyRequirements: string[];
  keyResponsibilities: string[];
  seniorityLevel: string;
  skillsRequired: string[];
  analysisModel: string;
}

export class JoobleEnricher {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Claude API key required for job enrichment');
    }
    this.apiKey = apiKey;
  }

  /**
   * Analyze a Jooble snippet using Claude to extract structured job information
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250805',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const textContent = data.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude API');
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<EnrichedJobDescription, 'analysisModel'>;

    return {
      ...parsed,
      analysisModel: 'claude-opus-4-20250805',
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

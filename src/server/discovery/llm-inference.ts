import { TokenInferenceResult } from './types';

export interface Env {
  AI: any;
  [key: string]: any;
}

export async function inferTokensViaCloudflareAI(
  companyName: string,
  env: Env
): Promise<TokenInferenceResult[]> {
  if (!env.AI) {
    console.warn('[llm-inference] Workers AI binding "AI" is not available');
    return [];
  }

  const prompt = `
    Given the company name "${companyName}", infer likely ATS board tokens for Greenhouse, Lever, Ashby, and Workable.
    Board tokens are typically derived from the company name in lowercase, with hyphens or underscores.
    
    Examples:
    - "Acme Corporation" -> Greenhouse: "acme-corporation", "acme-corp"; Lever: "acme-corporation"; Ashby: "acme-corp"
    - "TechCorp Inc" -> Greenhouse: "techcorp"; Lever: "techcorp-inc"
    
    Respond ONLY with a JSON object inside a single markdown code block containing these exact keys: "greenhouse", "lever", "ashby", "workable".
    Values must be arrays of likely string tokens (lowercase, hyphens/underscores).
    
    Example response format:
    \`\`\`json
    {
      "greenhouse": ["acme-corporation", "acme-corp"],
      "lever": ["acme-corporation"],
      "ashby": ["acme-corp"],
      "workable": ["acme-corporation"]
    }
    \`\`\`
  `;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      prompt,
      max_tokens: 300,
    });

    const text = (response as { response: string }).response ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]) as Record<string, string[]>;
    const results: TokenInferenceResult[] = [];

    const validAts = ['greenhouse', 'lever', 'ashby', 'workable'];
    for (const [ats, tokens] of Object.entries(parsed)) {
      if (validAts.includes(ats.toLowerCase())) {
        results.push({
          ats: ats.toLowerCase(),
          inferredTokens: tokens.slice(0, 3).map(t => t.toLowerCase().trim()),
          confidence: 0.65, // base confidence for LLM guess
        });
      }
    }

    return results;
  } catch (e) {
    console.error(`[llm-inference] Cloudflare AI inference failed for ${companyName}:`, e);
    return [];
  }
}

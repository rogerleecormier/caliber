// Cloudflare Workers AI types and utilities

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRunOptions {
  messages: AIMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
}

export interface AIResponse {
  response: string;
}

// Define environment interface extension for AI
export interface AIEnv {
  AI: {
    run: (model: string, options: AIRunOptions) => Promise<AIResponse>;
  };
}

// Available models
export const AI_MODELS = {
  LLAMA_3_3_70B: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  LLAMA_3_1_8B: '@cf/meta/llama-3.1-8b-instruct-fp8',
  LLAMA_4_SCOUT: '@cf/meta/llama-4-scout-17b-16e-instruct',
  QWEN3_30B_A3B: '@cf/qwen/qwen3-30b-a3b-fp8',
  GEMMA_4_12B: '@cf/google/gemma-4-12b-it',
  GEMMA_4_26B: '@cf/google/gemma-4-26b-a4b-it',
} as const;

// Default model for general job analysis tasks
export const DEFAULT_MODEL = AI_MODELS.GEMMA_4_26B;

// Faster MoE model for batch scoring (3.3B active params, native function calling)
export const SCORING_MODEL = AI_MODELS.GEMMA_4_26B;

// Strong instruction-following for structured JSON output (resume section tailoring)
export const RESUME_TAILORING_MODEL = AI_MODELS.GEMMA_4_26B;

// Resume SECTION PARSING (extraction) model. Must be a non-reasoning,
// instruction-following model that honors response_format JSON mode and does
// NOT emit chain-of-thought. Gemma 4 26B (-a4b reasoning variant) dumps its
// thinking into the output and ignores JSON-schema constraints, so it is NOT
// usable for structured extraction. Llama 3.3 70B (fp8-fast) follows the
// JSON instruction reliably.
export const RESUME_PARSING_MODEL = AI_MODELS.LLAMA_3_3_70B;

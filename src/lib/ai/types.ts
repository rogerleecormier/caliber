// Cloudflare Workers AI types and utilities
import { z } from 'zod';

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

// Structured Gap Analysis Schema using Zod for strict JSON output
export const GapItemSchema = z.object({
  requirement: z.string().describe('The specific requirement from the job description'),
  requirementType: z.enum(['required', 'preferred']).describe('Whether this is required or preferred'),
  explanation: z.string().describe('Explanation of the match or gap'),
});

export const StructuredGapAnalysisSchema = z.object({
  matched: z.array(GapItemSchema).describe('Requirements where the candidate fulfills the criteria completely'),
  partial: z.array(GapItemSchema).describe('Requirements where the candidate fulfills the criteria partially'),
  gap: z.array(GapItemSchema).describe('Requirements entirely missing from the candidate\'s profile'),
});

export type GapItem = z.infer<typeof GapItemSchema>;
export type StructuredGapAnalysis = z.infer<typeof StructuredGapAnalysisSchema>;

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

// Resume SECTION TAILORING model. Must reliably follow the instruction-heavy
// section prompts and emit ONLY the requested JSON. Gemma 4 26B (-a4b) ignores
// these constraints and echoes the prompt's own guideline text back as
// "content" (e.g. a summary that reads "Summarize the CURRENT SUMMARY..."), so
// it is NOT usable here — same reason it was dropped for parsing below. Llama
// 3.3 70B (fp8-fast) follows the JSON instruction reliably.
// Reverted back to LLAMA_3_3_70B because GEMMA_4_26B echoes prompt guidelines and fails JSON formatting.
export const RESUME_TAILORING_MODEL = AI_MODELS.LLAMA_3_3_70B;

// Resume SECTION PARSING (extraction) model. Must be a non-reasoning,
// instruction-following model that honors response_format JSON mode and does
// NOT emit chain-of-thought. Gemma 4 26B (-a4b reasoning variant) dumps its
// thinking into the output and ignores JSON-schema constraints, so it is NOT
// usable for structured extraction. Llama 3.3 70B (fp8-fast) follows the
// JSON instruction reliably.
// Reverted back to LLAMA_3_3_70B.
export const RESUME_PARSING_MODEL = AI_MODELS.LLAMA_3_3_70B;

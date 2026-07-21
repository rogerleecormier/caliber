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
export const DEFAULT_MODEL = AI_MODELS.LLAMA_3_3_70B;

// Fast, token-efficient 8B model for batch scoring and keyword matching
export const SCORING_MODEL = AI_MODELS.LLAMA_3_1_8B;

// Resume SECTION TAILORING model. High quality 70B model for user-facing resume generation.
export const RESUME_TAILORING_MODEL = AI_MODELS.LLAMA_3_3_70B;

// Resume SECTION PARSING (extraction) model using fast 8B model.
export const RESUME_PARSING_MODEL = AI_MODELS.LLAMA_3_1_8B;

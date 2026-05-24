import type { CloudflareEnv } from "./cloudflare";
import { DEFAULT_MODEL } from "./ai/types";

export const WORKERS_AI_CONTEXT_WINDOW_TOKENS = 128_000;
const APPROX_CHARS_PER_TOKEN = 4;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TruncationOptions {
  marker?: string;
  preserveHeadRatio?: number;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function allocateTokenBudgets(
  texts: string[],
  totalBudget: number,
  minPerText = 512,
): number[] {
  const estimated = texts.map((text) => estimateTokenCount(text));
  const nonEmptyIndexes = estimated
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count > 0);

  if (nonEmptyIndexes.length === 0) {
    return texts.map(() => 0);
  }

  const minimumBudget = minPerText * nonEmptyIndexes.length;
  const safeBudget = Math.max(totalBudget, minimumBudget);
  const totalEstimated = estimated.reduce((sum, count) => sum + count, 0);

  if (totalEstimated <= safeBudget) {
    return estimated;
  }

  const budgets = texts.map(() => 0);
  for (const { index } of nonEmptyIndexes) {
    budgets[index] = minPerText;
  }

  const remainingBudget = safeBudget - minimumBudget;
  const additionalNeeds = estimated.map((count) => Math.max(count - minPerText, 0));
  const totalAdditionalNeed = additionalNeeds.reduce((sum, count) => sum + count, 0);

  if (remainingBudget <= 0 || totalAdditionalNeed === 0) {
    return budgets;
  }

  let distributed = 0;
  for (let index = 0; index < additionalNeeds.length; index += 1) {
    if (additionalNeeds[index] === 0) continue;
    const allocation = Math.floor((additionalNeeds[index] / totalAdditionalNeed) * remainingBudget);
    budgets[index] += allocation;
    distributed += allocation;
  }

  let remainder = remainingBudget - distributed;
  for (const { index } of nonEmptyIndexes) {
    if (remainder <= 0) break;
    budgets[index] += 1;
    remainder -= 1;
  }

  return budgets;
}

export function truncateToTokenBudget(
  text: string,
  tokenBudget: number,
  options: TruncationOptions = {},
): string {
  if (!text || tokenBudget <= 0) {
    return "";
  }

  const estimatedTokens = estimateTokenCount(text);
  if (estimatedTokens <= tokenBudget) {
    return text;
  }

  const marker = options.marker ?? "\n...[truncated for model budget]...\n";
  const maxChars = tokenBudget * APPROX_CHARS_PER_TOKEN;
  if (maxChars <= marker.length + 32) {
    return text.slice(0, Math.max(0, maxChars));
  }

  const preserveHeadRatio = Math.min(Math.max(options.preserveHeadRatio ?? 0.7, 0.1), 0.9);
  const remainingChars = maxChars - marker.length;
  const headChars = Math.floor(remainingChars * preserveHeadRatio);
  const tailChars = Math.max(0, remainingChars - headChars);

  return `${text.slice(0, headChars)}${marker}${text.slice(Math.max(0, text.length - tailChars))}`;
}

/**
 * Call Cloudflare Workers AI with a messages array.
 * Normalizes all Workers AI result shapes to a plain string.
 */
export async function callWorkersAI(
  env: Partial<CloudflareEnv>,
  messages: Message[],
  options?: { maxTokens?: number },
): Promise<string> {
  if (!env.AI) {
    throw new Error("Workers AI binding not available in development mode.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await env.AI.run(DEFAULT_MODEL as any, {
    messages,
    max_tokens: options?.maxTokens ?? 4096,
    stream: false,
  } as any);

  // Workers AI can return: { response: string }, a plain string, or a stream.
  let text: string;
  if (typeof result === "string") {
    text = result;
  } else if (result && typeof result.response === "string") {
    text = result.response;
  } else if (result && result.response != null) {
    text = JSON.stringify(result.response);
  } else if (result && typeof result.result === "string") {
    text = result.result;
  } else if (result && result.result != null) {
    text = JSON.stringify(result.result);
  } else {
    console.error("[callWorkersAI] Unexpected result shape:", JSON.stringify(result).slice(0, 200));
    text = result != null ? JSON.stringify(result) : "";
  }

  if (!text.trim()) {
    throw new Error("Workers AI returned an empty response");
  }
  return text;
}

export const callClaude = callWorkersAI;

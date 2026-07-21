import { SCORING_MODEL } from "./types";
import { JOB_SCORE_ALL_PROMPT } from "./prompts";
import { withRetry } from "../sync-queue";
import { pruneJobDescription } from "../prune-job-description";

export interface JobScoreResult {
  jobId: string;
  atsScore: number;
  careerScore: number;
  outlookScore: number;
  masterScore: number;
  atsReason: string;
  careerReason: string;
  outlookReason: string;
  isUnicorn: boolean;
  unicornReason: string | null;
  quickAnalysis?: string | null;
}

export interface JobToScore {
  id: string;
  title: string;
  description: string;
}

export interface ScoringWeights {
  ats: number;
  career: number;
  outlook: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  ats: 0.4,
  career: 0.3,
  outlook: 0.3,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

export async function scoreJobAgainstProfile(
  ai: any,
  profile: string,
  job: JobToScore,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  options?: { allowUnicorn?: boolean },
): Promise<JobScoreResult> {
  const allowUnicorn = options?.allowUnicorn ?? true;
  try {
    const cleanedDescription = pruneJobDescription(job.description || "").substring(0, 3500);

    const userMessage = `
Candidate Profile:
${profile}

Job Title: ${job.title}

Job Description:
${cleanedDescription}
`;

    const response = await withRetry(
      () =>
        ai.run(SCORING_MODEL as any, {
          messages: [
            { role: "system", content: JOB_SCORE_ALL_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 600,
          temperature: 0.1,
          reasoning: { enabled: false }, // Disable slow chain-of-thought generation
        }),
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        timeoutMs: 30000, // 30 seconds timeout per attempt
        onRetry: (attempt, err) => {
          console.warn(`[job-score] AI call failed for job ${job.id} (attempt ${attempt}), retrying...`, err);
        },
      }
    );

    let responseText = "";
    const res = response as any;

    if (res?.choices?.[0]?.message) {
      const msg = res.choices[0].message;
      responseText = msg.content || msg.reasoning_content || "";
    } else if (typeof response === "string") {
      responseText = response;
    } else if (res?.response) {
      responseText = res.response;
    } else if (res?.result?.response) {
      responseText = res.result.response;
    } else if (response) {
      responseText = JSON.stringify(response);
    }

    if (!responseText) {
      throw new Error("Empty response from AI");
    }

    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
      if (parsed.response && typeof parsed.response === "object") parsed = parsed.response;
      if (parsed.result && typeof parsed.result === "object") parsed = parsed.result;
    } catch {
      try {
        const cleaned = jsonStr.replace(/,\s*\}/g, "}").replace(/,\s*\]/g, "]");
        parsed = JSON.parse(cleaned);
      } catch {
        return {
          jobId: job.id,
          atsScore: 50,
          careerScore: 50,
          outlookScore: 50,
          masterScore: 50,
          atsReason: "Parsing failed — check AI output format.",
          careerReason: "Parsing failed — check AI output format.",
          outlookReason: "Parsing failed — check AI output format.",
          isUnicorn: false,
          unicornReason: null,
          quickAnalysis: "Failed to parse AI scoring details.",
        };
      }
    }

    const getVal = (obj: any, keys: string[]) => {
      for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
      }
      return undefined;
    };

    const atsScore = clamp(getVal(parsed, ["atsScore", "ats_score", "atsScoreValue"]) ?? 51, 0, 100);
    const careerScore = clamp(getVal(parsed, ["careerScore", "career_score", "careerEnhancement"]) ?? 52, 0, 100);
    const outlookScore = clamp(getVal(parsed, ["outlookScore", "outlook_score", "careerOutlook"]) ?? 53, 0, 100);

    const atsReason = getVal(parsed, ["atsReason", "ats_reason"]) || "No details available.";
    const careerReason = getVal(parsed, ["careerReason", "career_reason"]) || "No details available.";
    const outlookReason = getVal(parsed, ["outlookReason", "outlook_reason"]) || "No details available.";

    const isUnicorn = allowUnicorn ? !!getVal(parsed, ["isUnicorn", "is_unicorn", "unicorn"]) : false;
    const unicornReason = allowUnicorn ? (getVal(parsed, ["unicornReason", "unicorn_reason"]) || null) : null;
    const quickAnalysis = getVal(parsed, ["quickAnalysis", "quick_analysis"]) || "No quick analysis generated.";

    const masterScore = clamp(
      atsScore * weights.ats + careerScore * weights.career + outlookScore * weights.outlook,
      0,
      100,
    );

    return {
      jobId: job.id,
      atsScore,
      careerScore,
      outlookScore,
      masterScore,
      atsReason,
      careerReason,
      outlookReason,
      isUnicorn,
      unicornReason: isUnicorn ? unicornReason : null,
      quickAnalysis,
    };
  } catch (error) {
    console.error(`Error scoring job ${job.id}:`, error);
    return {
      jobId: job.id,
      atsScore: 0,
      careerScore: 0,
      outlookScore: 0,
      masterScore: 0,
      atsReason: "Scoring failed due to an error.",
      careerReason: "Scoring failed due to an error.",
      outlookReason: "Scoring failed due to an error.",
      isUnicorn: false,
      unicornReason: null,
      quickAnalysis: "Scoring failed due to an error.",
    };
  }
}

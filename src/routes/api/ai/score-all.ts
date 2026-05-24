import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAIFromContext, type AIEnv } from "../../../lib/ai";
import { SCORING_MODEL } from "../../../lib/ai/types";
import { JOB_SCORE_ALL_PROMPT } from "../../../lib/ai/prompts";

export interface JobScoreResult {
    jobId: number;
    atsScore: number;
    careerScore: number;
    outlookScore: number;
    masterScore: number;
    atsReason: string;
    careerReason: string;
    outlookReason: string;
    isUnicorn: boolean;
    unicornReason: string | null;
}

interface JobToScore {
    id: number;
    title: string;
    description: string;
}

// Score weights: 40% ATS, 30% Career Enhancement, 30% Career Outlook
const ATS_WEIGHT = 0.4;
const CAREER_WEIGHT = 0.3;
const OUTLOOK_WEIGHT = 0.3;

// Batch size to avoid rate limits
const BATCH_SIZE = 5;

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(val)));
}

async function scoreJob(
    ai: AIEnv['AI'],
    profile: string,
    job: JobToScore
): Promise<JobScoreResult> {
    try {
        const userMessage = `
Candidate Profile:
${profile}

Job Title: ${job.title}

Job Description:
${(job.description || '').substring(0, 2000)}
`;

        const response = await ai.run(
            SCORING_MODEL as any,
            {
                messages: [
                    { role: "system", content: JOB_SCORE_ALL_PROMPT },
                    { role: "user", content: userMessage },
                ],
                max_tokens: 1500, // Increased for reasoning models
                temperature: 0.1,
            }
        );

        // Parse AI response object
        let responseText = "";

        // Handle Cloudflare's specific reasoning model response structure
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

        console.log(`[score-all] Cleaned response text for job ${job.id}:`, responseText.substring(0, 200) + "...");

        // Clean JSON from potential markdown
        let jsonStr = responseText.trim();

        // Use regex to find the FIRST { and the LAST }
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
            // Handle nested objects if they exist
            if (parsed.response && typeof parsed.response === "object") parsed = parsed.response;
            if (parsed.result && typeof parsed.result === "object") parsed = parsed.result;
        } catch (parseErr) {
            console.error(`JSON Parse Error for job ${job.id}. Raw content:`, jsonStr.substring(0, 300));
            // Try one more time by stripping common issues like trailing commas or multiple objects
            try {
                // Very basic trailing comma fix
                const cleaned = jsonStr.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
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
                };
            }
        }

        // Extremely robust field extraction (handles camelCase, snake_case, etc.)
        const getVal = (obj: any, keys: string[]): any => {
            for (const key of keys) {
                if (obj[key] !== undefined) return obj[key];
            }
            return undefined;
        };

        const atsScore = clamp(getVal(parsed, ['atsScore', 'ats_score', 'atsScoreValue']) ?? 51, 0, 100);
        const careerScore = clamp(getVal(parsed, ['careerScore', 'career_score', 'careerEnhancement']) ?? 52, 0, 100);
        const outlookScore = clamp(getVal(parsed, ['outlookScore', 'outlook_score', 'careerOutlook']) ?? 53, 0, 100);

        const atsReason = getVal(parsed, ['atsReason', 'ats_reason']) || "No details available.";
        const careerReason = getVal(parsed, ['careerReason', 'career_reason']) || "No details available.";
        const outlookReason = getVal(parsed, ['outlookReason', 'outlook_reason']) || "No details available.";

        const isUnicorn = !!getVal(parsed, ['isUnicorn', 'is_unicorn', 'unicorn']);
        const unicornReason = getVal(parsed, ['unicornReason', 'unicorn_reason']) || null;

        const masterScore = clamp(
            atsScore * ATS_WEIGHT + careerScore * CAREER_WEIGHT + outlookScore * OUTLOOK_WEIGHT,
            0,
            100
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
        };
    }
}

export const Route = createFileRoute("/api/ai/score-all")({
    server: {
        handlers: {
            POST: async ({ request, context }: { request: Request; context: any }) => {
                console.log("[score-all] POST request received");
                try {
                    const ai = await getAIFromContext(context);
                    console.log("[score-all] AI available:", !!ai);

                    if (!ai) {
                        return json(
                            { success: false, error: "AI not available" },
                            { status: 503 }
                        );
                    }

                    const body = await request.json() as {
                        resume?: string;
                        skills?: string[];
                        jobs: JobToScore[];
                    };
                    console.log(`[score-all] Processing ${body.jobs?.length || 0} jobs`);

                    if (!body.resume && (!body.skills || body.skills.length === 0)) {
                        return json(
                            { success: false, error: "Resume or skills are required" },
                            { status: 400 }
                        );
                    }

                    if (!body.jobs || body.jobs.length === 0) {
                        return json(
                            { success: false, error: "At least one job is required" },
                            { status: 400 }
                        );
                    }

                    // Build candidate profile string
                    let profile = "";
                    if (body.resume) {
                        profile = `Resume:\n${body.resume}`;
                    }
                    if (body.skills && body.skills.length > 0) {
                        profile += `\n\nKey Skills: ${body.skills.join(", ")}`;
                    }

                    // Process jobs in batches to respect rate limits
                    const allResults: JobScoreResult[] = [];
                    const jobs = body.jobs.slice(0, 50); // Cap at 50 jobs max

                    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
                        const batch = jobs.slice(i, i + BATCH_SIZE);
                        console.log(`[score-all] Batch ${i / BATCH_SIZE + 1} starting...`);
                        const batchResults = await Promise.all(
                            batch.map((job: JobToScore) => scoreJob(ai, profile, job))
                        );
                        allResults.push(...batchResults);
                    }

                    console.log(`[score-all] Completed. Scored ${allResults.length} jobs.`);
                    // Sort by master score descending
                    allResults.sort((a, b) => b.masterScore - a.masterScore);

                    return json({
                        success: true,
                        data: {
                            scores: allResults,
                            totalScored: allResults.length,
                            weights: {
                                ats: ATS_WEIGHT,
                                career: CAREER_WEIGHT,
                                outlook: OUTLOOK_WEIGHT,
                            },
                        },
                    });
                } catch (error) {
                    console.error("Error in score-all:", error);
                    return json(
                        {
                            success: false,
                            error: error instanceof Error ? error.message : "Scoring failed",
                        },
                        { status: 500 }
                    );
                }
            },
        },
    },
});

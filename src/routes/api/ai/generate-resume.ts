import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAIFromContext } from "../../../lib/ai";
import { RESUME_TAILOR_PROMPT } from "../../../lib/ai/prompts";
import { callWorkersAI } from "../../../lib/ai-gateway";
import { jsonrepair } from "jsonrepair";

interface GenerateResumeRequest {
  jobTitle: string;
  jobDescription: string;
  jobCompany: string;
  userResume?: string;
  userName?: string;
}

export const Route = createFileRoute("/api/ai/generate-resume")({
  server: {
    handlers: {
      POST: async ({ request, context }: { request: Request; context: any }) => {
        try {
          const ai = await getAIFromContext(context);
          if (!ai) {
            return json({ success: false, error: "AI not available" }, { status: 503 });
          }

          const body = (await request.json()) as GenerateResumeRequest;
          const { jobTitle, jobDescription, jobCompany, userResume, userName } = body;

          if (!jobDescription) {
            return json({ success: false, error: "Job description is required" }, { status: 400 });
          }

          const userContent = `Job Title: ${jobTitle}
Company: ${jobCompany}

Job Description:
${jobDescription}

User Resume:
${userResume || "No specific resume provided. Create a generic placeholder resume based on the job description."}

User Name: ${userName || "[Candidate Name]"}`;

          const rawResponse = await callWorkersAI(
            { AI: ai },
            [
              { role: "system", content: RESUME_TAILOR_PROMPT },
              { role: "user", content: userContent },
            ],
            { maxTokens: 4000 },
          );

          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            return json({ success: true, data: { resume: rawResponse, coverLetter: "", gapAnalysis: "", careerAnalysis: "" } });
          }

          let parsed: { resume?: string; coverLetter?: string; gapAnalysis?: string; careerAnalysis?: string };
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = JSON.parse(jsonrepair(jsonMatch[0]));
          }

          return json({
            success: true,
            data: {
              resume: String(parsed.resume ?? ""),
              coverLetter: String(parsed.coverLetter ?? ""),
              gapAnalysis: String(parsed.gapAnalysis ?? ""),
              careerAnalysis: String(parsed.careerAnalysis ?? ""),
            },
          });
        } catch (error) {
          console.error("Error generating resume:", error);
          return json(
            { success: false, error: error instanceof Error ? error.message : "Failed to generate resume" },
            { status: 500 },
          );
        }
      },
    },
  },
});

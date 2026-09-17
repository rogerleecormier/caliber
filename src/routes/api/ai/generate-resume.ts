import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAIFromContext } from "../../../lib/ai";
import {
  RESUME_PROMPT,
  COVER_LETTER_PROMPT,
  GAP_ANALYSIS_PROMPT,
  CAREER_ANALYSIS_PROMPT,
} from "../../../lib/ai/prompts";
import { callWorkersAI } from "../../../lib/ai-gateway";

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

          const jobContext = `Job Title: ${jobTitle}
Company: ${jobCompany}

Job Description:
${jobDescription}`;

          const sourceResume =
            userResume || "No specific resume provided. Create a generic placeholder resume based on the job description.";
          const candidateName = userName || "[Candidate Name]";
          const aiEnv = { AI: ai };

          // Tailor the resume first — the cover letter reasons about the TAILORED
          // resume (not the raw master resume) so it references what actually made the cut.
          const resume = await callWorkersAI(
            aiEnv,
            [
              { role: "system", content: RESUME_PROMPT },
              {
                role: "user",
                content: `${jobContext}\n\nSource Resume:\n${sourceResume}\n\nCandidate Name: ${candidateName}`,
              },
            ],
            { maxTokens: 4000, temperature: 0.2, topP: 0.9 },
          );

          const [coverLetter, gapAnalysis, careerAnalysis] = await Promise.all([
            callWorkersAI(
              aiEnv,
              [
                { role: "system", content: COVER_LETTER_PROMPT },
                {
                  role: "user",
                  content: `${jobContext}\n\nResume:\n${resume}\n\nSign off as: ${candidateName}`,
                },
              ],
              { maxTokens: 1200, temperature: 0.2, topP: 0.9 },
            ),
            callWorkersAI(
              aiEnv,
              [
                { role: "system", content: GAP_ANALYSIS_PROMPT },
                { role: "user", content: `${jobContext}\n\nCandidate Resume:\n${sourceResume}` },
              ],
              { maxTokens: 800, temperature: 0.2, topP: 0.9 },
            ),
            callWorkersAI(
              aiEnv,
              [
                { role: "system", content: CAREER_ANALYSIS_PROMPT },
                { role: "user", content: `${jobContext}\n\nCandidate Resume:\n${sourceResume}` },
              ],
              { maxTokens: 800, temperature: 0.2, topP: 0.9 },
            ),
          ]);

          return json({
            success: true,
            data: { resume, coverLetter, gapAnalysis, careerAnalysis },
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

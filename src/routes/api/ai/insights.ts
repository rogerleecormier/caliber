import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { analyzeJobInsights, getAIFromContext, type AIEnv } from "../../../lib/ai";

export const Route = createFileRoute("/api/ai/insights")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const ai = await getAIFromContext(context);

          if (!ai) {
            console.error("AI binding not found. Context keys:", Object.keys(context || {}));
            console.error("globalThis.__CF_ENV__:", (globalThis as any).__CF_ENV__ ? 'exists' : 'undefined');
            return json(
              { success: false, error: "AI not available - binding not found" },
              { status: 503 }
            );
          }

          const body = await request.json() as {
            description: string;
            title?: string;
          };

          if (!body.description) {
            return json(
              { success: false, error: "Job description is required" },
              { status: 400 }
            );
          }

          // Create an env-like object for our AI functions
          const env: AIEnv = { AI: ai };

          const insights = await analyzeJobInsights(
            env,
            body.description,
            body.title
          );

          return json({
            success: true,
            data: insights,
          });
        } catch (error) {
          console.error("Error analyzing job:", error);
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Failed to analyze job",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});


import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { parseSearchQuery, getAIFromContext, type AIEnv } from "../../../lib/ai";

export const Route = createFileRoute("/api/ai/search")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const ai = await getAIFromContext(context);

          if (!ai) {
            return json(
              { success: false, error: "AI not available" },
              { status: 503 }
            );
          }

          const body = await request.json() as { query: string };

          if (!body.query) {
            return json(
              { success: false, error: "Search query is required" },
              { status: 400 }
            );
          }

          const env: AIEnv = { AI: ai };
          const parsed = await parseSearchQuery(env, body.query);

          return json({
            success: true,
            data: parsed,
          });
        } catch (error) {
          console.error("Error parsing search:", error);
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Failed to parse search",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});


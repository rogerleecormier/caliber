import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

// Categories table was dropped in the normalized-jobs unification.
// Stubbed pending a follow-on epic rebuild of category browsing.
export const Route = createFileRoute("/api/v3/categories")({
  server: {
    handlers: {
      GET: async () => {
        return json({
          success: true,
          data: [],
        });
      },
    },
  },
});

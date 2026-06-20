import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { resolveSessionUser } from "../../../lib/resolve-user";
import { canAccessLinkedInSearch } from "../../../lib/private-features";

// Live LinkedIn browser scraping has been retired in favor of Search Agents, which query the
// unified canonical jobs database (fed by the discovery/crawler agents) and score matches
// against the user's resume. This endpoint now returns 410 Gone and points clients there.
export const Route = createFileRoute("/api/linkedin/search")({
  server: {
    handlers: {
      POST: async () => {
        const user = await resolveSessionUser();
        if (!user?.id) {
          return json({ success: false, error: "Authentication required" }, { status: 401 });
        }
        if (!canAccessLinkedInSearch(user)) {
          return json({ success: false, error: "Not found" }, { status: 404 });
        }
        return json(
          {
            success: false,
            error:
              "Live LinkedIn search has been replaced by Search Agents, which query the unified jobs database and score matches against your resume. Create a Search Agent to continue.",
            code: "SEARCH_MOVED_TO_AGENTS",
          },
          { status: 410 },
        );
      },
    },
  },
});

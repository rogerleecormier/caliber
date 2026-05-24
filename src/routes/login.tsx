import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.string().optional(),
});

// All auth is handled at spearyx.com/login. This route exists only to catch
// any lingering internal redirects and forward them to the central login page.
export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ search }) => {
    const params = new URLSearchParams();
    const redirectTo = search.redirect
      ? `https://jobs.spearyx.com${search.redirect}`
      : "https://jobs.spearyx.com/analyze";
    params.set("redirect", redirectTo);
    if (search.reason) params.set("reason", search.reason);
    if (typeof window !== "undefined") {
      window.location.replace(`https://spearyx.com/login?${params.toString()}`);
    }
  },
  component: () => null,
});

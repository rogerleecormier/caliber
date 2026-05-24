import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ search }) => {
    const params = new URLSearchParams();
    if (search.redirect) params.set("redirect", search.redirect);
    if (search.reason) params.set("reason", search.reason);
    const qs = params.toString();
    if (typeof window !== "undefined") {
      window.location.replace(`https://caliber.rcormier.dev/login${qs ? `?${qs}` : ""}`);
    }
  },
  component: () => null,
});

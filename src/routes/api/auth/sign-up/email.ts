import { createFileRoute } from "@tanstack/react-router";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";

export const Route = createFileRoute("/api/auth/sign-up/email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCloudflareEnv();
        const auth = getAuthInstance(env);
        return auth.handler(request);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";

export const Route = createFileRoute("/api/auth/get-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getCloudflareEnv();
        const auth = getAuthInstance(env);
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const env = getCloudflareEnv();
        const auth = getAuthInstance(env);
        return auth.handler(request);
      },
    },
  },
});

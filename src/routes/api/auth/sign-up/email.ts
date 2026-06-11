import { createFileRoute } from "@tanstack/react-router";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";

export const Route = createFileRoute("/api/auth/sign-up/email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = await getCloudflareEnvAsync();
        const auth = getAuthInstance(env);
        return auth.handler(request);
      },
    },
  },
});

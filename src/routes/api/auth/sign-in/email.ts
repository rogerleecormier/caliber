import { createFileRoute } from "@tanstack/react-router";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";

export const Route = createFileRoute("/api/auth/sign-in/email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const env = getCloudflareEnv();
          const auth = getAuthInstance(env);
          return await auth.handler(request);
        } catch (error) {
          console.error("[auth sign-in error]", error);
          return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

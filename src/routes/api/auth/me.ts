import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { extractSessionToken, getAuthCorsHeaders } from "@caliber/shared-utils";
import { getDb } from "@/db/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const env = getCloudflareEnv();
          if (!env.DB || !env.KV) {
            return json({ user: null }, { headers: getAuthCorsHeaders(request) });
          }

          const token = extractSessionToken(request);
          if (!token) return json({ user: null }, { headers: getAuthCorsHeaders(request) });

          const raw = await env.KV.get(`session:${token}`);
          if (!raw) return json({ user: null }, { headers: getAuthCorsHeaders(request) });

          const { userId } = JSON.parse(raw) as { userId: number };
          const db = getDb(env.DB);
          const [dbUser] = await db
            .select({ id: users.id, email: users.email, role: users.role })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!dbUser) return json({ user: null }, { headers: getAuthCorsHeaders(request) });
          return json(
            { user: { id: dbUser.id, email: dbUser.email, role: dbUser.role } },
            { headers: getAuthCorsHeaders(request) },
          );
        } catch {
          return json({ user: null }, { headers: getAuthCorsHeaders(request) });
        }
      },
    },
  },
});

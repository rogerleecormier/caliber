import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import {
  SESSION_COOKIE,
  extractSessionToken,
  deleteSession,
  getAuthCorsHeaders,
  getSessionCookieDomain,
  shouldUseSecureSessionCookie,
} from "@caliber/shared-utils";
import { setCookie } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: {
            ...getAuthCorsHeaders(request),
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        try {
          const env = getCloudflareEnv();
          const token = extractSessionToken(request);
          if (token) await deleteSession(token, env.KV);

          setCookie(SESSION_COOKIE, "", {
            path: "/",
            httpOnly: true,
            secure: shouldUseSecureSessionCookie(request),
            sameSite: "lax" as const,
            maxAge: 0,
            domain: getSessionCookieDomain(request),
          });

          return json({ success: true }, { headers: getAuthCorsHeaders(request) });
        } catch {
          return json({ success: false }, { headers: getAuthCorsHeaders(request), status: 500 });
        }
      },
    },
  },
});

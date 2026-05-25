import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";
import { getRequest } from "@tanstack/react-start/server";
import { getDb } from "@/db/db";
import { session as authSession, user, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export type { SessionUser };

const AUTH_COOKIE_CANDIDATES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session-token",
  "__Secure-better-auth.session-token",
] as const;

function readCookieValue(cookieHeader: string, names: readonly string[]) {
  const cookies = cookieHeader.split(";");
  for (const name of names) {
    const prefix = `${name}=`;
    const found = cookies.find((part) => part.trimStart().startsWith(prefix));
    if (!found) continue;
    const rawValue = found.trim().slice(prefix.length);
    if (!rawValue) continue;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

async function resolveRole(userId: string, email: string): Promise<"admin" | "user"> {
  const env = getCloudflareEnv();
  if (!env.DB) return "user";

  const db = getDb(env.DB);

  const [authUser] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (authUser?.role === "admin" || authUser?.role === "user") {
    return authUser.role;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [legacyUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (legacyUser?.role === "admin" || legacyUser?.role === "user") {
    return legacyUser.role;
  }

  return "user";
}

/**
 * Resolves the authenticated user from the better-auth session in the current request.
 * Call this from within a TanStack Start server function handler.
 * Returns null if not authenticated or if bindings are unavailable.
 */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  try {
    const env = getCloudflareEnv();
    const auth = getAuthInstance(env);
    const request = getRequest();

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      const { id, email, role } = session.user as { id: string; email: string; role?: string | null };
      if (role === "admin" || role === "user") {
        return { id, email, role };
      }
      const resolvedRole = await resolveRole(id, email);
      return { id, email, role: resolvedRole };
    }

    // Fallback for intermittent getSession null results during client navigation:
    // use the session token cookie directly against the auth session table.
    if (env.DB) {
      const cookieHeader = request.headers.get("cookie") ?? "";
      const sessionToken = readCookieValue(cookieHeader, AUTH_COOKIE_CANDIDATES);
      if (!sessionToken) return null;

      const db = getDb(env.DB);
      const now = Math.floor(Date.now() / 1000);

      const [fallbackRow] = await db
        .select({
          id: user.id,
          email: user.email,
          role: user.role,
        })
        .from(authSession)
        .innerJoin(user, eq(authSession.userId, user.id))
        .where(and(eq(authSession.token, sessionToken), gt(authSession.expiresAt, now)))
        .limit(1);

      if (!fallbackRow) return null;

      const role =
        fallbackRow.role === "admin" || fallbackRow.role === "user"
          ? fallbackRow.role
          : await resolveRole(fallbackRow.id, fallbackRow.email);

      return {
        id: fallbackRow.id,
        email: fallbackRow.email,
        role,
      };
    }

    return null;
  } catch (error) {
    console.error("[resolveSessionUser] error:", error);
    return null;
  }
}

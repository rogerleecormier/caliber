import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";
import { getRequest } from "@tanstack/react-start/server";
import { getDb } from "@/db/db";
import { user, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type { SessionUser };

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

    if (!session?.user) return null;

    const { id, email, role } = session.user as { id: string; email: string; role?: string | null };

    if (role === "admin" || role === "user") {
      return { id, email, role };
    }

    // Migration fallback: if better-auth session payload omits role,
    // recover it from canonical and legacy user tables.
    if (env.DB) {
      const db = getDb(env.DB);

      const [authUser] = await db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, id))
        .limit(1);

      if (authUser?.role === "admin" || authUser?.role === "user") {
        return { id, email, role: authUser.role };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const [legacyUser] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (legacyUser?.role === "admin" || legacyUser?.role === "user") {
        return { id, email, role: legacyUser.role };
      }
    }

    return { id, email, role: "user" };
  } catch (error) {
    console.error("[resolveSessionUser] error:", error);
    return null;
  }
}

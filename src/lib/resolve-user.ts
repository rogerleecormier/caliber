import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { extractSessionToken } from "@/lib/session";
import { getDb } from "@/db/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRequest } from "@tanstack/react-start/server";

export type { SessionUser };

/**
 * Resolves the authenticated user from the session cookie in the current request.
 * Call this from within a TanStack Start server function handler.
 * Returns null if not authenticated or if bindings are unavailable.
 */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  try {
    const env = getCloudflareEnv();
    if (!env.DB || !env.KV) return null;

    const request = getRequest();
    const token = extractSessionToken(request);
    if (!token) return null;

    const raw = await env.KV.get(`session:${token}`);
    if (!raw) return null;

    const { userId } = JSON.parse(raw) as { userId: number };
    const db = getDb(env.DB);
    const [dbUser] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser) return null;
    return { id: dbUser.id, email: dbUser.email, role: dbUser.role };
  } catch (error) {
    console.error("[resolveSessionUser] error:", error);
    return null;
  }
}
